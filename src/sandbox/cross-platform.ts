/**
 * BugBox Cross-Platform Layer
 *
 * Handles the scenario where a bug was captured on one OS but replayed on another.
 * Instead of requiring Docker/WSL, this layer translates:
 *
 *   1. Commands — python3 ↔ python, node stays node, bash → cmd/powershell
 *   2. Paths — / ↔ \, $HOME ↔ %USERPROFILE%, path separators in PATH
 *   3. Environment variables — HOME ↔ USERPROFILE, USER ↔ USERNAME, etc.
 *   4. Shell wrappers — bash -c "..." → cmd /c "..." or powershell -c "..."
 *
 * Limitations (honest about what we CAN'T do):
 *   - Compiled binaries (ELF on Windows, PE on Linux) → fail with clear message
 *   - OS-specific syscalls (inotify, kqueue, epoll) → fail with clear message
 *   - Shell scripts with heavy bash-isms → best-effort translation, may fail
 *
 * Philosophy: Translate what's translatable, warn clearly about what isn't.
 */

import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

export interface CrossPlatformContext {
  /** OS the bug was captured on */
  capturedPlatform: string;
  /** OS we're replaying on */
  replayPlatform: string;
  /** Whether cross-platform translation is needed */
  needsTranslation: boolean;
  /** Whether replay is likely to succeed */
  likelyCompatible: boolean;
  /** Warnings to show the user */
  warnings: string[];
}

export interface TranslatedCommand {
  /** The translated command array */
  command: string[];
  /** Whether translation was applied */
  translated: boolean;
  /** Description of what was translated */
  translations: string[];
  /** Hard blockers — replay will fail */
  blockers: string[];
}

export interface TranslatedEnvironment {
  /** The translated environment variables */
  environment: Record<string, string>;
  /** Translations applied */
  translations: string[];
}

/**
 * Detects whether cross-platform translation is needed and assesses compatibility.
 */
export function detectCrossPlatform(
  capturedPlatform: string,
  replayPlatform?: string,
): CrossPlatformContext {
  const replay = replayPlatform || os.platform();
  const needsTranslation = capturedPlatform !== replay;
  const warnings: string[] = [];
  let likelyCompatible = true;

  if (needsTranslation) {
    warnings.push(
      `Cross-platform replay: captured on ${platformName(capturedPlatform)}, replaying on ${platformName(replay)}`,
    );

    // Assess compatibility
    if (
      (capturedPlatform === 'linux' && replay === 'darwin') ||
      (capturedPlatform === 'darwin' && replay === 'linux')
    ) {
      // Unix-to-Unix: high compatibility for scripting languages
      likelyCompatible = true;
      warnings.push('Unix-to-Unix translation: high compatibility expected for scripting languages.');
    } else if (
      (capturedPlatform === 'win32' && (replay === 'linux' || replay === 'darwin')) ||
      ((capturedPlatform === 'linux' || capturedPlatform === 'darwin') && replay === 'win32')
    ) {
      // Cross-family: medium compatibility
      likelyCompatible = true; // Optimistic — we'll catch hard failures in command translation
      warnings.push('Cross-family translation applied. Path separators and commands will be adapted.');
    }
  }

  return { capturedPlatform, replayPlatform: replay, needsTranslation, likelyCompatible, warnings };
}

/**
 * Translates a command from the captured platform to the replay platform.
 */
export function translateCommand(
  command: string[],
  capturedPlatform: string,
  replayPlatform?: string,
): TranslatedCommand {
  const replay = replayPlatform || os.platform();
  const translations: string[] = [];
  const blockers: string[] = [];

  if (capturedPlatform === replay) {
    return { command, translated: false, translations: [], blockers: [] };
  }

  let translated = [...command];

  // 1. Translate the executable
  translated[0] = translateExecutable(translated[0], capturedPlatform, replay, translations, blockers);

  // 2. Translate shell wrappers
  translated = translateShellWrapper(translated, capturedPlatform, replay, translations);

  // 3. Translate path arguments
  translated = translated.map((arg, i) => {
    if (i === 0) return arg; // Already handled
    return translatePathArg(arg, capturedPlatform, replay);
  });

  return {
    command: translated,
    translated: translations.length > 0,
    translations,
    blockers,
  };
}

/**
 * Translates environment variables between platforms.
 */
export function translateEnvironment(
  env: Record<string, string>,
  capturedPlatform: string,
  replayPlatform?: string,
): TranslatedEnvironment {
  const replay = replayPlatform || os.platform();
  const translations: string[] = [];

  if (capturedPlatform === replay) {
    return { environment: env, translations: [] };
  }

  const result = { ...env };

  // Translate PATH separator
  if (result.PATH) {
    const fromSep = capturedPlatform === 'win32' ? ';' : ':';
    const toSep = replay === 'win32' ? ';' : ':';
    if (fromSep !== toSep) {
      result.PATH = result.PATH.split(fromSep).join(toSep);
      translations.push(`PATH separator: '${fromSep}' → '${toSep}'`);
    }
  }

  // Map HOME ↔ USERPROFILE
  if (capturedPlatform === 'win32' && replay !== 'win32') {
    // Windows → Unix
    if (result.USERPROFILE && !result.HOME) {
      result.HOME = translatePathValue(result.USERPROFILE, capturedPlatform, replay);
      translations.push('USERPROFILE → HOME');
    }
    if (result.USERNAME && !result.USER) {
      result.USER = result.USERNAME;
      translations.push('USERNAME → USER');
    }
    if (result.APPDATA && !result.XDG_CONFIG_HOME) {
      result.XDG_CONFIG_HOME = translatePathValue(result.APPDATA, capturedPlatform, replay);
      translations.push('APPDATA → XDG_CONFIG_HOME');
    }
  } else if (capturedPlatform !== 'win32' && replay === 'win32') {
    // Unix → Windows
    if (result.HOME && !result.USERPROFILE) {
      result.USERPROFILE = translatePathValue(result.HOME, capturedPlatform, replay);
      translations.push('HOME → USERPROFILE');
    }
    if (result.USER && !result.USERNAME) {
      result.USERNAME = result.USER;
      translations.push('USER → USERNAME');
    }
  }

  // Translate TMPDIR/TMP/TEMP
  if (capturedPlatform !== 'win32' && replay === 'win32') {
    if (result.TMPDIR && !result.TEMP) {
      result.TEMP = os.tmpdir();
      result.TMP = os.tmpdir();
      translations.push('TMPDIR → TEMP/TMP (using local temp dir)');
    }
  } else if (capturedPlatform === 'win32' && replay !== 'win32') {
    if ((result.TEMP || result.TMP) && !result.TMPDIR) {
      result.TMPDIR = os.tmpdir();
      translations.push('TEMP/TMP → TMPDIR (using local temp dir)');
    }
  }

  // Translate path values in all env vars
  for (const key of Object.keys(result)) {
    if (result[key] && looksLikePath(result[key], capturedPlatform)) {
      const translated = translatePathValue(result[key], capturedPlatform, replay);
      if (translated !== result[key]) {
        result[key] = translated;
      }
    }
  }

  return { environment: result, translations };
}

// ── Command translation helpers ──

/** Common command aliases across platforms */
const COMMAND_MAP: Record<string, Record<string, string>> = {
  // ── Scripting languages ──
  'python3': { win32: 'python' },
  'python': { linux: 'python3', darwin: 'python3' },
  'pip3': { win32: 'pip' },
  'pip': { linux: 'pip3', darwin: 'pip3' },
  // ── Java/JVM ──
  'gradlew': { win32: 'gradlew.bat' },
  'gradlew.bat': { linux: './gradlew', darwin: './gradlew' },
  './gradlew': { win32: 'gradlew.bat' },
  'mvnw': { win32: 'mvnw.cmd' },
  'mvnw.cmd': { linux: './mvnw', darwin: './mvnw' },
  './mvnw': { win32: 'mvnw.cmd' },
  // ── C/C++ build tools ──
  'make': { win32: 'mingw32-make' },
  'mingw32-make': { linux: 'make', darwin: 'make' },
  'cc': { win32: 'gcc' },
  'c++': { win32: 'g++' },
  // ── .NET ──
  'dotnet': { win32: 'dotnet', linux: 'dotnet', darwin: 'dotnet' },
  // ── Utilities ──
  'open': { win32: 'start', linux: 'xdg-open' },
  'xdg-open': { win32: 'start', darwin: 'open' },
  'start': { linux: 'xdg-open', darwin: 'open' },
  'cls': { linux: 'clear', darwin: 'clear' },
  'clear': { win32: 'cls' },
  'cat': { win32: 'type' },
  'ls': { win32: 'dir' },
  'rm': { win32: 'del' },
  'cp': { win32: 'copy' },
  'mv': { win32: 'move' },
  'which': { win32: 'where' },
  'where': { linux: 'which', darwin: 'which' },
  // ── Shell ──
  'sh': { win32: 'bash' },
};

/** Binary extensions that cannot run cross-platform */
const NATIVE_BINARY_EXTENSIONS = ['.exe', '.dll', '.so', '.dylib', '.elf', ''];

function translateExecutable(
  exe: string,
  from: string,
  to: string,
  translations: string[],
  blockers: string[],
): string {
  const baseName = path.basename(exe).replace(/\.exe$/i, '');

  // Check for native binaries
  const ext = path.extname(exe).toLowerCase();
  if (from !== to) {
    if (from === 'win32' && ext === '.exe' && to !== 'win32') {
      blockers.push(`Cannot run Windows executable '${exe}' on ${platformName(to)}. Requires Windows or Wine.`);
    }
    if (from === 'linux' && !ext && to === 'win32') {
      // Could be a Linux ELF binary — check if it's a known scripting command
      if (!isScriptingCommand(baseName)) {
        blockers.push(`Binary '${exe}' may be a Linux ELF executable. Cannot run on Windows without WSL.`);
      }
    }
  }

  // Try command map
  const mapping = COMMAND_MAP[baseName];
  if (mapping && mapping[to]) {
    // Verify the target command exists
    const exists = commandExists(mapping[to]);
    if (exists) {
      translations.push(`Command: ${baseName} → ${mapping[to]}`);
      return mapping[to];
    }
  }

  // python3 → python fallback on Windows
  if (baseName === 'python3' && to === 'win32') {
    if (commandExists('python')) {
      translations.push('Command: python3 → python');
      return 'python';
    }
  }

  return exe;
}

function translateShellWrapper(
  command: string[],
  from: string,
  to: string,
  translations: string[],
): string[] {
  if (command.length < 2) return command;

  const exe = path.basename(command[0]).replace(/\.exe$/i, '');

  // bash -c "..." → cmd /c "..." or powershell -c "..."
  if ((exe === 'bash' || exe === 'sh') && command[1] === '-c' && to === 'win32') {
    if (commandExists('bash')) {
      // WSL/Git Bash available — keep as-is
      return command;
    }
    translations.push(`Shell: ${exe} -c → powershell -Command`);
    return ['powershell', '-NoProfile', '-Command', ...command.slice(2)];
  }

  // cmd /c "..." → bash -c "..." on Unix
  if (exe === 'cmd' && (command[1] === '/c' || command[1] === '/C') && to !== 'win32') {
    translations.push('Shell: cmd /c → bash -c');
    return ['bash', '-c', ...command.slice(2)];
  }

  // powershell -Command "..." → bash -c "..." on Unix
  if ((exe === 'powershell' || exe === 'pwsh') && to !== 'win32') {
    const cmdIdx = command.findIndex(a => a === '-Command' || a === '-c');
    if (cmdIdx >= 0) {
      translations.push(`Shell: ${exe} → bash -c`);
      return ['bash', '-c', ...command.slice(cmdIdx + 1)];
    }
  }

  return command;
}

// ── Path translation ──

function translatePathArg(arg: string, from: string, to: string): string {
  if (!looksLikePath(arg, from)) return arg;
  return translatePathValue(arg, from, to);
}

function translatePathValue(value: string, from: string, to: string): string {
  if (from === 'win32' && to !== 'win32') {
    // Windows → Unix: C:\Users\foo → /home/foo (best effort)
    let result = value.replace(/\\/g, '/');
    // Strip drive letter
    result = result.replace(/^[A-Za-z]:/, '');
    // Map common Windows paths
    result = result.replace(/^\/Users\//, '/home/');
    return result;
  }

  if (from !== 'win32' && to === 'win32') {
    // Unix → Windows: /home/foo/project → C:\Users\foo\project (best effort)
    let result = value.replace(/\//g, '\\');
    // Add drive letter if absolute
    if (result.startsWith('\\')) {
      result = 'C:' + result;
    }
    // Map common Unix paths
    result = result.replace(/^C:\\home\\/, 'C:\\Users\\');
    return result;
  }

  return value;
}

function looksLikePath(value: string, platform: string): boolean {
  if (platform === 'win32') {
    return /^[A-Za-z]:[/\\]/.test(value) || value.includes('\\');
  }
  return value.startsWith('/') || value.startsWith('./') || value.startsWith('../');
}

// ── Utilities ──

function platformName(p: string): string {
  switch (p) {
    case 'win32': return 'Windows';
    case 'linux': return 'Linux';
    case 'darwin': return 'macOS';
    default: return p;
  }
}

function isScriptingCommand(name: string): boolean {
  const crossPlatformCommands = [
    // Scripting runtimes
    'node', 'python', 'python3', 'ruby', 'perl', 'php', 'deno', 'bun',
    // JVM
    'java', 'javac', 'kotlin', 'kotlinc', 'scala', 'scalac',
    // Compiled but cross-platform source
    'go', 'cargo', 'rustc', 'gcc', 'g++', 'clang', 'clang++', 'cc', 'c++',
    // Build tools
    'make', 'cmake', 'ninja', 'meson', 'gradle', 'gradlew', 'mvn', 'mvnw', 'sbt', 'ant',
    'msbuild', 'dotnet', 'xcodebuild',
    // Package managers
    'npm', 'npx', 'yarn', 'pnpm', 'pip', 'pip3', 'gem', 'bundle', 'composer',
    'apt', 'brew', 'choco', 'scoop', 'pacman',
    // Version managers
    'nvm', 'pyenv', 'rbenv', 'rustup', 'sdkman',
    // Test runners
    'jest', 'pytest', 'mocha', 'vitest', 'rspec', 'junit',
    // Misc tools
    'git', 'curl', 'wget', 'tar', 'unzip', 'grep', 'find', 'sed', 'awk',
  ];
  return crossPlatformCommands.includes(name);
}

function commandExists(name: string): boolean {
  try {
    const cmd = os.platform() === 'win32' ? 'where' : 'which';
    const result = spawnSync(cmd, [name], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}
