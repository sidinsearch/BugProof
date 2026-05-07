/**
 * Environment Snapshot
 * 
 * Captures runtime versions (Node.js, Python, Ruby, Go, Rust, Java, etc.)
 * at capture time. On replay, compares against the replayer's environment
 * and warns about mismatches that could affect reproduction.
 */

import { spawnSync } from 'child_process';
import * as os from 'os';

export interface RuntimeVersion {
  name: string;
  version: string;
  path?: string;
}

export interface EnvSnapshot {
  /** Node.js runtime */
  node: RuntimeVersion | null;
  /** Python runtime */
  python: RuntimeVersion | null;
  /** Ruby runtime */
  ruby: RuntimeVersion | null;
  /** Go runtime */
  go: RuntimeVersion | null;
  /** Rust/cargo runtime */
  rust: RuntimeVersion | null;
  /** Java runtime */
  java: RuntimeVersion | null;
  /** OS info */
  os: {
    platform: string;
    release: string;
    arch: string;
  };
  /** npm version (if available) */
  npm: RuntimeVersion | null;
  /** pip version (if available) */
  pip: RuntimeVersion | null;
}

/**
 * Captures the current development environment snapshot.
 * Each probe is fast (<100ms) and never throws.
 */
export function captureEnvSnapshot(): EnvSnapshot {
  return {
    node: probeRuntime('node', ['--version'], /v?([\d.]+)/),
    python: probeRuntime('python', ['--version'], /Python\s+([\d.]+)/) 
         ?? probeRuntime('python3', ['--version'], /Python\s+([\d.]+)/),
    ruby: probeRuntime('ruby', ['--version'], /ruby\s+([\d.]+)/),
    go: probeRuntime('go', ['version'], /go([\d.]+)/),
    rust: probeRuntime('rustc', ['--version'], /rustc\s+([\d.]+)/),
    java: probeRuntime('java', ['-version'], /version\s+"?([\d.]+)/),
    npm: probeRuntime('npm', ['--version'], /([\d.]+)/),
    pip: probeRuntime('pip', ['--version'], /pip\s+([\d.]+)/)
      ?? probeRuntime('pip3', ['--version'], /pip\s+([\d.]+)/),
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
    },
  };
}

/**
 * Compares two environment snapshots and returns mismatches.
 */
export function compareEnvSnapshots(
  captured: EnvSnapshot,
  current: EnvSnapshot,
): EnvMismatch[] {
  const mismatches: EnvMismatch[] = [];

  const runtimes: (keyof Omit<EnvSnapshot, 'os'>)[] = [
    'node', 'python', 'ruby', 'go', 'rust', 'java', 'npm', 'pip',
  ];

  for (const key of runtimes) {
    const cap = captured[key] as RuntimeVersion | null;
    const cur = current[key] as RuntimeVersion | null;

    if (cap && !cur) {
      mismatches.push({
        runtime: cap.name,
        severity: 'error',
        message: `${cap.name} ${cap.version} was available at capture but is not installed now.`,
        capturedVersion: cap.version,
        currentVersion: null,
      });
    } else if (cap && cur && cap.version !== cur.version) {
      const severity = isMajorMismatch(cap.version, cur.version) ? 'warning' : 'info';
      mismatches.push({
        runtime: cap.name,
        severity,
        message: `${cap.name} version mismatch: captured ${cap.version}, current ${cur.version}`,
        capturedVersion: cap.version,
        currentVersion: cur.version,
      });
    }
  }

  // OS platform mismatch
  if (captured.os.platform !== current.os.platform) {
    mismatches.push({
      runtime: 'os',
      severity: 'warning',
      message: `OS mismatch: captured on ${captured.os.platform}, replaying on ${current.os.platform}`,
      capturedVersion: captured.os.platform,
      currentVersion: current.os.platform,
    });
  }

  // Architecture mismatch
  if (captured.os.arch !== current.os.arch) {
    mismatches.push({
      runtime: 'arch',
      severity: 'info',
      message: `Architecture mismatch: captured on ${captured.os.arch}, replaying on ${current.os.arch}`,
      capturedVersion: captured.os.arch,
      currentVersion: current.os.arch,
    });
  }

  return mismatches;
}

export interface EnvMismatch {
  runtime: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  capturedVersion: string | null;
  currentVersion: string | null;
}

// ── Internal ──

function probeRuntime(
  command: string,
  args: string[],
  versionPattern: RegExp,
): RuntimeVersion | null {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Java outputs version to stderr
    const output = (result.stdout || '') + (result.stderr || '');
    const match = output.match(versionPattern);

    if (match) {
      // Get the full path
      const whichCmd = os.platform() === 'win32' ? 'where' : 'which';
      const whichResult = spawnSync(whichCmd, [command], {
        encoding: 'utf-8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return {
        name: command,
        version: match[1],
        path: whichResult.status === 0 ? whichResult.stdout.trim().split('\n')[0] : undefined,
      };
    }
  } catch {
    // Not installed or not accessible
  }
  return null;
}

function isMajorMismatch(v1: string, v2: string): boolean {
  const major1 = parseInt(v1.split('.')[0], 10);
  const major2 = parseInt(v2.split('.')[0], 10);
  return !isNaN(major1) && !isNaN(major2) && major1 !== major2;
}
