/**
 * Language Support Module
 *
 * Detects the project's programming language(s) and captures language-specific
 * context needed for cross-platform bug reproduction:
 *
 * - Node.js/TypeScript: package.json, node_modules state, npm/yarn/pnpm lockfiles
 * - Python: requirements.txt, pyproject.toml, virtual env detection
 * - Java/Kotlin: pom.xml, build.gradle, JDK version, classpath
 * - C/C++: Makefile, CMakeLists.txt, compiler version (gcc/clang/msvc)
 * - Go: go.mod, go.sum
 * - Rust: Cargo.toml, Cargo.lock, rustc version
 * - Ruby: Gemfile, Gemfile.lock
 * - .NET/C#: *.csproj, *.sln, dotnet version
 *
 * This information is stored in the artifact so replay can:
 * 1. Warn about missing build tools
 * 2. Suggest dependency installation commands
 * 3. Detect build system differences across platforms
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as os from 'os';

interface LanguageInfo {
  /** Primary language identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detected version of the primary runtime/compiler */
  version: string | null;
  /** Build system used */
  buildSystem: string | null;
  /** Package manager */
  packageManager: string | null;
  /** Lockfile path (relative) if present */
  lockfile: string | null;
  /** Whether a build step is likely needed before running */
  needsBuild: boolean;
  /** Cross-platform compatibility rating */
  crossPlatform: 'native' | 'high' | 'medium' | 'low';
  /** Platform-specific notes */
  notes: string[];
}

export interface ProjectLanguageContext {
  /** Detected languages (sorted by confidence) */
  languages: LanguageInfo[];
  /** Primary language (highest confidence) */
  primary: LanguageInfo | null;
  /** Build commands needed for reproduction */
  buildCommands: string[];
  /** Files critical for reproduction (lockfiles, configs) */
  criticalFiles: string[];
  /** Cross-platform warnings specific to this project */
  warnings: string[];
}

/** Detect project languages and capture context */
export function detectProjectLanguages(workingDir: string): ProjectLanguageContext {
  const languages: LanguageInfo[] = [];
  const buildCommands: string[] = [];
  const criticalFiles: string[] = [];
  const warnings: string[] = [];

  // Detect each language
  const detectors: LanguageDetector[] = [
    detectNodeJS,
    detectPython,
    detectJava,
    detectCpp,
    detectGo,
    detectRust,
    detectRuby,
    detectDotnet,
  ];

  for (const detect of detectors) {
    const result = detect(workingDir);
    if (result) {
      languages.push(result.language);
      buildCommands.push(...result.buildCommands);
      criticalFiles.push(...result.criticalFiles);
      warnings.push(...result.warnings);
    }
  }

  return {
    languages,
    primary: languages[0] || null,
    buildCommands,
    criticalFiles,
    warnings,
  };
}

// ── Detection types ──

interface DetectionResult {
  language: LanguageInfo;
  buildCommands: string[];
  criticalFiles: string[];
  warnings: string[];
}

type LanguageDetector = (workingDir: string) => DetectionResult | null;

// ── Node.js / TypeScript ──

function detectNodeJS(workingDir: string): DetectionResult | null {
  const pkgPath = path.join(workingDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;

  const warnings: string[] = [];
  const criticalFiles: string[] = ['package.json'];
  const buildCommands: string[] = [];

  // Detect package manager
  let packageManager = 'npm';
  let lockfile: string | null = null;

  if (fs.existsSync(path.join(workingDir, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
    lockfile = 'pnpm-lock.yaml';
  } else if (fs.existsSync(path.join(workingDir, 'yarn.lock'))) {
    packageManager = 'yarn';
    lockfile = 'yarn.lock';
  } else if (fs.existsSync(path.join(workingDir, 'package-lock.json'))) {
    packageManager = 'npm';
    lockfile = 'package-lock.json';
  } else if (fs.existsSync(path.join(workingDir, 'bun.lockb'))) {
    packageManager = 'bun';
    lockfile = 'bun.lockb';
  }

  if (lockfile) criticalFiles.push(lockfile);

  // Detect TypeScript
  const isTS = fs.existsSync(path.join(workingDir, 'tsconfig.json'));
  if (isTS) {
    criticalFiles.push('tsconfig.json');
    buildCommands.push(`${packageManager} run build`);
  }

  // Check if node_modules exists
  if (!fs.existsSync(path.join(workingDir, 'node_modules'))) {
    buildCommands.unshift(`${packageManager} install`);
  }

  // Probe node version
  const nodeVersion = probeVersion('node', ['--version'], /v?([\d.]+)/);

  return {
    language: {
      id: isTS ? 'typescript' : 'javascript',
      name: isTS ? 'TypeScript (Node.js)' : 'JavaScript (Node.js)',
      version: nodeVersion,
      buildSystem: isTS ? 'tsc' : null,
      packageManager,
      lockfile,
      needsBuild: isTS,
      crossPlatform: 'high',
      notes: ['Node.js is cross-platform. Same code runs on Windows/Linux/macOS.'],
    },
    buildCommands,
    criticalFiles,
    warnings,
  };
}

// ── Python ──

function detectPython(workingDir: string): DetectionResult | null {
  const indicators = [
    'requirements.txt', 'pyproject.toml', 'setup.py', 'setup.cfg',
    'Pipfile', 'poetry.lock', 'conda.yaml',
  ];

  const found = indicators.find(f => fs.existsSync(path.join(workingDir, f)));
  if (!found && !hasPythonFiles(workingDir)) return null;

  const warnings: string[] = [];
  const criticalFiles: string[] = [];
  const buildCommands: string[] = [];

  let packageManager = 'pip';
  let lockfile: string | null = null;

  if (fs.existsSync(path.join(workingDir, 'Pipfile.lock'))) {
    packageManager = 'pipenv';
    lockfile = 'Pipfile.lock';
    criticalFiles.push('Pipfile', 'Pipfile.lock');
    buildCommands.push('pipenv install');
  } else if (fs.existsSync(path.join(workingDir, 'poetry.lock'))) {
    packageManager = 'poetry';
    lockfile = 'poetry.lock';
    criticalFiles.push('pyproject.toml', 'poetry.lock');
    buildCommands.push('poetry install');
  } else if (fs.existsSync(path.join(workingDir, 'requirements.txt'))) {
    criticalFiles.push('requirements.txt');
    buildCommands.push('pip install -r requirements.txt');
  } else if (fs.existsSync(path.join(workingDir, 'pyproject.toml'))) {
    criticalFiles.push('pyproject.toml');
    buildCommands.push('pip install -e .');
  }

  // Virtual env detection
  const venvDirs = ['.venv', 'venv', 'env', '.env'];
  const hasVenv = venvDirs.some(d => fs.existsSync(path.join(workingDir, d)));
  if (!hasVenv) {
    warnings.push('No virtual environment detected. Replay may use system Python.');
  }

  // python vs python3 cross-platform
  warnings.push('Python command differs across platforms: python3 (Linux/macOS) vs python (Windows).');

  const pythonVersion = probeVersion('python', ['--version'], /Python\s+([\d.]+)/)
    ?? probeVersion('python3', ['--version'], /Python\s+([\d.]+)/);

  return {
    language: {
      id: 'python',
      name: 'Python',
      version: pythonVersion,
      buildSystem: null,
      packageManager,
      lockfile,
      needsBuild: false,
      crossPlatform: 'high',
      notes: [
        'Python is cross-platform. python3 ↔ python translation handled automatically.',
        'C extensions (e.g., numpy) may need platform-specific wheels.',
      ],
    },
    buildCommands,
    criticalFiles,
    warnings,
  };
}

// ── Java / Kotlin ──

function detectJava(workingDir: string): DetectionResult | null {
  const hasMaven = fs.existsSync(path.join(workingDir, 'pom.xml'));
  const hasGradle = fs.existsSync(path.join(workingDir, 'build.gradle'))
    || fs.existsSync(path.join(workingDir, 'build.gradle.kts'));
  const hasSbt = fs.existsSync(path.join(workingDir, 'build.sbt'));

  if (!hasMaven && !hasGradle && !hasSbt) return null;

  const warnings: string[] = [];
  const criticalFiles: string[] = [];
  const buildCommands: string[] = [];

  let buildSystem = 'unknown';
  if (hasMaven) {
    buildSystem = 'maven';
    criticalFiles.push('pom.xml');
    const mvnCmd = os.platform() === 'win32' ? 'mvnw.cmd' : './mvnw';
    const hasMvnWrapper = fs.existsSync(path.join(workingDir, 'mvnw'));
    buildCommands.push(hasMvnWrapper ? `${mvnCmd} compile` : 'mvn compile');
  } else if (hasGradle) {
    buildSystem = 'gradle';
    criticalFiles.push(fs.existsSync(path.join(workingDir, 'build.gradle.kts'))
      ? 'build.gradle.kts' : 'build.gradle');
    const gradleCmd = os.platform() === 'win32' ? 'gradlew.bat' : './gradlew';
    const hasGradleWrapper = fs.existsSync(path.join(workingDir, 'gradlew'));
    buildCommands.push(hasGradleWrapper ? `${gradleCmd} build` : 'gradle build');
    if (hasGradleWrapper) {
      criticalFiles.push('gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.properties');
    }
  } else if (hasSbt) {
    buildSystem = 'sbt';
    criticalFiles.push('build.sbt');
    buildCommands.push('sbt compile');
  }

  // Java version matters a lot
  const javaVersion = probeVersion('java', ['-version'], /version\s+"?([\d.]+)/);
  if (javaVersion) {
    const major = parseInt(javaVersion.split('.')[0], 10);
    if (major >= 9) {
      warnings.push(`Java ${major} detected. Ensure replay system has JDK ${major}+.`);
    }
  }

  warnings.push('Java is cross-platform (JVM), but build tool wrappers (gradlew/mvnw) differ per OS.');
  warnings.push('Ensure JAVA_HOME is set correctly on the replay system.');

  return {
    language: {
      id: 'java',
      name: 'Java',
      version: javaVersion,
      buildSystem,
      packageManager: buildSystem,
      lockfile: null,
      needsBuild: true,
      crossPlatform: 'high',
      notes: [
        'JVM bytecode is cross-platform. Build wrappers handle OS differences.',
        'JDK version must match (major version). gradlew/mvnw handle build tool versioning.',
      ],
    },
    buildCommands,
    criticalFiles,
    warnings,
  };
}

// ── C / C++ ──

function detectCpp(workingDir: string): DetectionResult | null {
  const hasCMake = fs.existsSync(path.join(workingDir, 'CMakeLists.txt'));
  const hasMakefile = fs.existsSync(path.join(workingDir, 'Makefile'))
    || fs.existsSync(path.join(workingDir, 'makefile'));
  const hasMeson = fs.existsSync(path.join(workingDir, 'meson.build'));
  const hasVcxproj = findFile(workingDir, '*.vcxproj');

  if (!hasCMake && !hasMakefile && !hasMeson && !hasVcxproj && !hasCFiles(workingDir)) return null;

  const warnings: string[] = [];
  const criticalFiles: string[] = [];
  const buildCommands: string[] = [];

  let buildSystem = 'unknown';
  if (hasCMake) {
    buildSystem = 'cmake';
    criticalFiles.push('CMakeLists.txt');
    buildCommands.push('cmake -B build', 'cmake --build build');
  } else if (hasMeson) {
    buildSystem = 'meson';
    criticalFiles.push('meson.build');
    buildCommands.push('meson setup build', 'ninja -C build');
  } else if (hasMakefile) {
    buildSystem = 'make';
    criticalFiles.push('Makefile');
    buildCommands.push('make');
  } else if (hasVcxproj) {
    buildSystem = 'msbuild';
    buildCommands.push('msbuild /p:Configuration=Release');
  }

  // Detect compiler
  const compilerVersion: string | null = (() => {
    if (os.platform() === 'win32') {
      return probeVersion('cl', [], /Version\s+([\d.]+)/)
        ?? probeVersion('gcc', ['--version'], /gcc.*?([\d.]+)/);
    }
    return probeVersion('gcc', ['--version'], /gcc.*?([\d.]+)/)
      ?? probeVersion('clang', ['--version'], /clang.*?([\d.]+)/);
  })();

  // C/C++ is NOT cross-platform for binaries
  warnings.push('C/C++ produces platform-specific binaries. Source must be recompiled on the target OS.');
  warnings.push('Compiler (gcc/clang/MSVC) and version must be compatible.');
  if (buildSystem === 'make') {
    warnings.push('Makefile may contain platform-specific commands. CMake recommended for cross-platform.');
  }
  if (os.platform() === 'win32' && buildSystem !== 'cmake' && buildSystem !== 'meson') {
    warnings.push('Windows: ensure Visual Studio Build Tools or MinGW/MSYS2 is installed.');
  }

  return {
    language: {
      id: 'cpp',
      name: 'C/C++',
      version: compilerVersion,
      buildSystem,
      packageManager: null,
      lockfile: null,
      needsBuild: true,
      crossPlatform: 'low',
      notes: [
        'C/C++ source is portable, but binaries are platform-specific.',
        'Must recompile on target OS. Compiler flags may differ.',
        'CMake provides the best cross-platform build experience.',
      ],
    },
    buildCommands,
    criticalFiles,
    warnings,
  };
}

// ── Go ──

function detectGo(workingDir: string): DetectionResult | null {
  if (!fs.existsSync(path.join(workingDir, 'go.mod'))) return null;

  const criticalFiles = ['go.mod'];
  const buildCommands: string[] = [];
  const warnings: string[] = [];

  if (fs.existsSync(path.join(workingDir, 'go.sum'))) {
    criticalFiles.push('go.sum');
  }

  buildCommands.push('go build ./...');

  const goVersion = probeVersion('go', ['version'], /go([\d.]+)/);

  warnings.push('Go produces platform-specific binaries. Rebuild on target OS with `go build`.');
  warnings.push('Go source is cross-platform. Cross-compilation: GOOS=linux go build');

  return {
    language: {
      id: 'go',
      name: 'Go',
      version: goVersion,
      buildSystem: 'go',
      packageManager: 'go modules',
      lockfile: 'go.sum',
      needsBuild: true,
      crossPlatform: 'medium',
      notes: [
        'Go source compiles anywhere Go is installed.',
        'Built-in cross-compilation support (GOOS/GOARCH).',
        'CGo dependencies may not be portable.',
      ],
    },
    buildCommands,
    criticalFiles,
    warnings,
  };
}

// ── Rust ──

function detectRust(workingDir: string): DetectionResult | null {
  if (!fs.existsSync(path.join(workingDir, 'Cargo.toml'))) return null;

  const criticalFiles = ['Cargo.toml'];
  const buildCommands: string[] = [];
  const warnings: string[] = [];

  if (fs.existsSync(path.join(workingDir, 'Cargo.lock'))) {
    criticalFiles.push('Cargo.lock');
  }

  buildCommands.push('cargo build');

  const rustVersion = probeVersion('rustc', ['--version'], /rustc\s+([\d.]+)/);

  warnings.push('Rust produces platform-specific binaries. Rebuild on target OS with `cargo build`.');

  return {
    language: {
      id: 'rust',
      name: 'Rust',
      version: rustVersion,
      buildSystem: 'cargo',
      packageManager: 'cargo',
      lockfile: 'Cargo.lock',
      needsBuild: true,
      crossPlatform: 'medium',
      notes: [
        'Rust source is cross-platform. Cross-compilation via `--target`.',
        'Binaries are platform-specific. Must rebuild on target.',
        'Ensure same Rust toolchain version for reproducibility.',
      ],
    },
    buildCommands,
    criticalFiles,
    warnings,
  };
}

// ── Ruby ──

function detectRuby(workingDir: string): DetectionResult | null {
  if (!fs.existsSync(path.join(workingDir, 'Gemfile'))) return null;

  const criticalFiles = ['Gemfile'];
  const buildCommands: string[] = ['bundle install'];
  const warnings: string[] = [];

  if (fs.existsSync(path.join(workingDir, 'Gemfile.lock'))) {
    criticalFiles.push('Gemfile.lock');
  }

  const rubyVersion = probeVersion('ruby', ['--version'], /ruby\s+([\d.]+)/);

  warnings.push('Ruby gems with native extensions may fail on different OS.');

  return {
    language: {
      id: 'ruby',
      name: 'Ruby',
      version: rubyVersion,
      buildSystem: null,
      packageManager: 'bundler',
      lockfile: 'Gemfile.lock',
      needsBuild: false,
      crossPlatform: 'high',
      notes: [
        'Ruby is cross-platform. Same code runs everywhere Ruby is installed.',
        'Native extensions (e.g., nokogiri) require platform-specific compilation.',
      ],
    },
    buildCommands,
    criticalFiles,
    warnings,
  };
}

// ── .NET / C# ──

function detectDotnet(workingDir: string): DetectionResult | null {
  const hasCsproj = findFile(workingDir, '*.csproj');
  const hasSln = findFile(workingDir, '*.sln');

  if (!hasCsproj && !hasSln) return null;

  const criticalFiles: string[] = [];
  const buildCommands = ['dotnet restore', 'dotnet build'];
  const warnings: string[] = [];

  if (hasCsproj) criticalFiles.push(hasCsproj);
  if (hasSln) criticalFiles.push(hasSln);

  const dotnetVersion = probeVersion('dotnet', ['--version'], /([\d.]+)/);

  warnings.push('.NET is cross-platform (Core/.NET 5+). Ensure same SDK version.');
  if (!dotnetVersion) {
    warnings.push('.NET SDK not found. Install from https://dot.net');
  }

  return {
    language: {
      id: 'dotnet',
      name: 'C# (.NET)',
      version: dotnetVersion,
      buildSystem: 'dotnet',
      packageManager: 'nuget',
      lockfile: null,
      needsBuild: true,
      crossPlatform: 'high',
      notes: [
        '.NET 5+ is fully cross-platform.',
        '.NET Framework (4.x) is Windows-only — check target framework.',
        'NuGet packages restore automatically via `dotnet restore`.',
      ],
    },
    buildCommands,
    criticalFiles,
    warnings,
  };
}

// ── Utility helpers ──

function probeVersion(command: string, args: string[], pattern: RegExp): string | null {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = (result.stdout || '') + (result.stderr || '');
    const match = output.match(pattern);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function hasPythonFiles(dir: string): boolean {
  try {
    const entries = fs.readdirSync(dir);
    return entries.some(e => e.endsWith('.py'));
  } catch {
    return false;
  }
}

function hasCFiles(dir: string): boolean {
  try {
    const entries = fs.readdirSync(dir);
    return entries.some(e => e.endsWith('.c') || e.endsWith('.cpp') || e.endsWith('.h') || e.endsWith('.cc'));
  } catch {
    return false;
  }
}

function findFile(dir: string, globPattern: string): string | null {
  const ext = globPattern.replace('*', '');
  try {
    const entries = fs.readdirSync(dir);
    const match = entries.find(e => e.endsWith(ext));
    return match || null;
  } catch {
    return null;
  }
}
