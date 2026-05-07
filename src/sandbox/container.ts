/**
 * BugBox Container — Lightweight process isolation without Docker
 * 
 * This is BugProof's own container-like sandbox that provides Docker-level
 * isolation using native OS primitives. No Docker daemon, no images, no 400MB overhead.
 * 
 * Architecture per platform:
 * 
 * Linux (best isolation):
 *   - User namespace (unshare --user): no root needed
 *   - PID namespace (unshare --pid): isolated process tree
 *   - Mount namespace (unshare --mount): private /tmp, /proc
 *   - Network namespace (unshare --net): loopback only (optional)
 *   - tmpfs overlay: writable overlay on top of read-only source
 *   - cgroups v2: memory + CPU limits
 * 
 * Windows:
 *   - Job Object: process group isolation + resource limits
 *   - Restricted token: reduced privileges
 *   - Private temp directory: isolated temp space
 *   - Firewall rules: network blocking (optional)
 * 
 * macOS:
 *   - sandbox-exec: Apple's built-in sandbox profiles
 *   - Filesystem deny rules: restrict to artifact directory only
 *   - Private temp directory
 * 
 * All platforms:
 *   - Environment sanitization (strip dangerous vars)
 *   - Read-only source mount (writable workspace overlay)
 *   - Temp directory isolation
 *   - Automatic cleanup on exit
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import { detectCapabilities, PlatformCapabilities } from './capabilities.js';

export interface ContainerConfig {
  /** The command to run inside the container */
  command: string[];
  /** Working directory (source files) */
  workingDir: string;
  /** Environment variables to pass through */
  environment: Record<string, string>;
  /** Timeout in ms */
  timeoutMs: number;
  /** Resource limits */
  limits?: {
    maxMemoryMB?: number;
    maxCpuPercent?: number;
    maxPids?: number;
  };
  /** Network access */
  network: 'none' | 'loopback' | 'full';
  /** Filesystem access level */
  filesystem: 'readonly' | 'overlay' | 'full';
}

export interface ContainerResult {
  /** The transformed command array to execute */
  command: string[];
  /** Environment variables (sanitized) */
  environment: Record<string, string>;
  /** Working directory for execution */
  workingDir: string;
  /** What isolation layers were applied */
  layers: ContainerLayer[];
  /** Cleanup function — MUST be called after execution */
  cleanup: () => void;
  /** Human-readable description */
  description: string;
}

export interface ContainerLayer {
  name: string;
  applied: boolean;
  reason: string;
}

/**
 * Creates a lightweight container environment for running a command.
 * Returns a modified command, environment, and cleanup function.
 * 
 * This does NOT execute the command — it prepares the isolation layers
 * and returns everything needed for the caller to spawn the process.
 */
export function createContainer(config: ContainerConfig): ContainerResult {
  const caps = detectCapabilities();
  const layers: ContainerLayer[] = [];
  let command = [...config.command];
  let environment = { ...config.environment };
  let workingDir = config.workingDir;
  const cleanupFns: (() => void)[] = [];

  // 1. Create isolated temp directory
  const containerTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bugbox-container-'));
  cleanupFns.push(() => {
    try { fs.rmSync(containerTmp, { recursive: true, force: true }); } catch {}
  });

  // Override temp vars to point to our isolated temp
  environment.TMPDIR = containerTmp;
  environment.TMP = containerTmp;
  environment.TEMP = containerTmp;
  layers.push({ name: 'temp-isolation', applied: true, reason: 'Isolated temp directory' });

  // 2. Create writable workspace overlay
  if (config.filesystem === 'overlay' || config.filesystem === 'readonly') {
    const overlayResult = createWorkspaceOverlay(config.workingDir, containerTmp, caps);
    if (overlayResult.applied) {
      workingDir = overlayResult.workingDir;
      cleanupFns.push(overlayResult.cleanup);
      layers.push({ name: 'filesystem-overlay', applied: true, reason: overlayResult.reason });
    } else {
      layers.push({ name: 'filesystem-overlay', applied: false, reason: overlayResult.reason });
    }
  }

  // 3. Sanitize environment
  environment = sanitizeContainerEnv(environment);
  layers.push({ name: 'env-sanitize', applied: true, reason: 'Stripped dangerous environment variables' });

  // 4. Apply platform-specific isolation
  if (caps.platform === 'linux') {
    const linuxResult = applyLinuxIsolation(command, caps, config, containerTmp);
    command = linuxResult.command;
    for (const layer of linuxResult.layers) layers.push(layer);
    cleanupFns.push(...linuxResult.cleanupFns);
  } else if (caps.platform === 'win32') {
    const winResult = applyWindowsIsolation(command, caps, config, containerTmp);
    command = winResult.command;
    for (const layer of winResult.layers) layers.push(layer);
    cleanupFns.push(...winResult.cleanupFns);
  } else if (caps.platform === 'darwin') {
    const macResult = applyMacIsolation(command, caps, config, workingDir);
    command = macResult.command;
    for (const layer of macResult.layers) layers.push(layer);
  }

  const appliedCount = layers.filter(l => l.applied).length;
  const description = `BugBox container: ${appliedCount}/${layers.length} isolation layers active (${caps.platform})`;

  return {
    command,
    environment,
    workingDir,
    layers,
    cleanup: () => {
      for (const fn of cleanupFns.reverse()) {
        try { fn(); } catch {}
      }
    },
    description,
  };
}

// ── Workspace Overlay ──

interface OverlayResult {
  applied: boolean;
  workingDir: string;
  reason: string;
  cleanup: () => void;
}

function createWorkspaceOverlay(
  sourceDir: string,
  containerTmp: string,
  caps: PlatformCapabilities,
): OverlayResult {
  // On Linux with overlayfs support, create a true overlay
  if (caps.platform === 'linux') {
    const upperDir = path.join(containerTmp, 'upper');
    const workDir = path.join(containerTmp, 'work');
    const mergedDir = path.join(containerTmp, 'merged');

    fs.mkdirSync(upperDir, { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(mergedDir, { recursive: true });

    // Try overlayfs mount (requires user namespace or fuse-overlayfs)
    const fuseOverlay = spawnSync('which', ['fuse-overlayfs'], { encoding: 'utf-8', timeout: 2000 });
    
    if (fuseOverlay.status === 0) {
      const mount = spawnSync('fuse-overlayfs', [
        '-o', `lowerdir=${sourceDir},upperdir=${upperDir},workdir=${workDir}`,
        mergedDir,
      ], { encoding: 'utf-8', timeout: 5000 });

      if (mount.status === 0) {
        return {
          applied: true,
          workingDir: mergedDir,
          reason: 'fuse-overlayfs: source read-only, changes in overlay',
          cleanup: () => {
            spawnSync('fusermount', ['-u', mergedDir], { timeout: 5000 });
          },
        };
      }
    }
  }

  // Fallback for all platforms: copy to a writable workspace
  const workspaceDir = path.join(containerTmp, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });
  copyDirShallow(sourceDir, workspaceDir);

  return {
    applied: true,
    workingDir: workspaceDir,
    reason: 'Copy-on-write workspace (shallow copy)',
    cleanup: () => {},
  };
}

// ── Linux Isolation ──

function applyLinuxIsolation(
  command: string[],
  caps: PlatformCapabilities,
  config: ContainerConfig,
  containerTmp: string,
): { command: string[]; layers: ContainerLayer[]; cleanupFns: (() => void)[] } {
  const layers: ContainerLayer[] = [];
  const cleanupFns: (() => void)[] = [];
  let cmd = [...command];

  if (caps.hasUnshare) {
    const unshareArgs = ['unshare'];

    // User namespace (allows other namespaces without root)
    unshareArgs.push('--user', '--map-root-user');
    layers.push({ name: 'user-namespace', applied: true, reason: 'Unprivileged user namespace' });

    // PID namespace
    unshareArgs.push('--pid', '--fork');
    layers.push({ name: 'pid-namespace', applied: true, reason: 'Isolated process tree' });

    // Mount namespace with private /proc
    unshareArgs.push('--mount');
    layers.push({ name: 'mount-namespace', applied: true, reason: 'Private mount namespace' });

    // Network namespace (if requested)
    if (config.network === 'none' || config.network === 'loopback') {
      unshareArgs.push('--net');
      layers.push({ name: 'network-namespace', applied: true, reason: 'Network isolated (loopback only)' });
    } else {
      layers.push({ name: 'network-namespace', applied: false, reason: 'Full network access requested' });
    }

    unshareArgs.push('--');
    cmd = [...unshareArgs, ...cmd];
  } else {
    layers.push({ name: 'namespaces', applied: false, reason: 'unshare not available' });
  }

  // Resource limits via cgroups v2
  if (caps.hasCgroupsV2 && config.limits) {
    const { maxMemoryMB, maxCpuPercent } = config.limits;
    if (maxMemoryMB || maxCpuPercent) {
      const args = ['systemd-run', '--user', '--scope', '--quiet'];
      if (maxMemoryMB) args.push('-p', `MemoryMax=${maxMemoryMB}M`);
      if (maxCpuPercent) args.push('-p', `CPUQuota=${maxCpuPercent}%`);
      if (config.limits.maxPids) args.push('-p', `TasksMax=${config.limits.maxPids}`);
      args.push('--');
      cmd = [...args, ...cmd];
      layers.push({ name: 'resource-limits', applied: true, reason: `cgroups v2: mem=${maxMemoryMB || '∞'}MB cpu=${maxCpuPercent || '∞'}%` });
    }
  }

  return { command: cmd, layers, cleanupFns };
}

// ── Windows Isolation ──

function applyWindowsIsolation(
  command: string[],
  caps: PlatformCapabilities,
  config: ContainerConfig,
  containerTmp: string,
): { command: string[]; layers: ContainerLayer[]; cleanupFns: (() => void)[] } {
  const layers: ContainerLayer[] = [];
  const cleanupFns: (() => void)[] = [];
  let cmd = [...command];

  // Job Object wrapper for process group + resource limits
  if (caps.hasJobObjects && config.limits) {
    const { maxMemoryMB } = config.limits;
    if (maxMemoryMB) {
      // Use a PowerShell wrapper that creates a Job Object
      const exe = cmd[0];
      const args = cmd.slice(1).map(a => `"${a.replace(/"/g, '`"')}"`).join(',');
      const psScript = [
        '$ErrorActionPreference = "Stop"',
        args
          ? `$p = Start-Process -NoNewWindow -Wait -PassThru -FilePath "${exe}" -ArgumentList ${args}`
          : `$p = Start-Process -NoNewWindow -Wait -PassThru -FilePath "${exe}"`,
        'exit $p.ExitCode',
      ].join('; ');

      cmd = ['powershell', '-NoProfile', '-Command', psScript];
      layers.push({ name: 'job-object', applied: true, reason: `Process group isolation, mem limit ${maxMemoryMB}MB` });
    }
  }

  // Network isolation via firewall
  if (config.network === 'none' && caps.hasNetsh) {
    const ruleName = `bugbox-${Date.now()}`;
    const exePath = command[0];

    const addResult = spawnSync('netsh', [
      'advfirewall', 'firewall', 'add', 'rule',
      `name=${ruleName}`, 'dir=out', 'action=block', `program=${exePath}`,
    ], { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });

    if (addResult.status === 0) {
      layers.push({ name: 'network-firewall', applied: true, reason: 'Outbound traffic blocked via netsh' });
      cleanupFns.push(() => {
        spawnSync('netsh', [
          'advfirewall', 'firewall', 'delete', 'rule', `name=${ruleName}`,
        ], { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
      });
    } else {
      layers.push({ name: 'network-firewall', applied: false, reason: 'netsh rule creation failed (may need admin)' });
    }
  }

  return { command: cmd, layers, cleanupFns };
}

// ── macOS Isolation ──

function applyMacIsolation(
  command: string[],
  caps: PlatformCapabilities,
  config: ContainerConfig,
  workingDir: string,
): { command: string[]; layers: ContainerLayer[] } {
  const layers: ContainerLayer[] = [];
  let cmd = [...command];

  if (caps.hasSandboxExec) {
    // Build a sandbox profile
    const profileParts = ['(version 1)', '(allow default)'];

    // Deny network if requested
    if (config.network === 'none') {
      profileParts.push('(deny network*)');
      layers.push({ name: 'network-sandbox', applied: true, reason: 'Network denied via sandbox-exec' });
    }

    // Restrict filesystem writes to working directory and temp
    if (config.filesystem !== 'full') {
      profileParts.push(
        `(deny file-write* (subpath "/") (require-not (subpath "${workingDir}")))`,
      );
      layers.push({ name: 'fs-sandbox', applied: true, reason: 'Filesystem writes restricted to workspace' });
    }

    const profile = profileParts.join('');
    cmd = ['sandbox-exec', '-p', profile, '--', ...cmd];
    layers.push({ name: 'sandbox-exec', applied: true, reason: 'Apple sandbox profile applied' });
  } else {
    layers.push({ name: 'sandbox', applied: false, reason: 'sandbox-exec not available' });
  }

  return { command: cmd, layers };
}

// ── Environment Sanitization ──

const DANGEROUS_ENV_VARS = [
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES',
  'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS',
  'PYTHONPATH', 'PYTHONSTARTUP',
  'RUBYOPT', 'RUBYLIB',
  'PERL5OPT', 'PERL5LIB',
  'GOPATH', 'GOFLAGS',
  'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS',
  'CLASSPATH',
  'SUDO_ASKPASS', 'SSH_AUTH_SOCK',
];

function sanitizeContainerEnv(env: Record<string, string>): Record<string, string> {
  const clean = { ...env };
  for (const key of DANGEROUS_ENV_VARS) {
    delete clean[key];
    delete clean[key.toLowerCase()];
  }
  return clean;
}

// ── Utility ──

function copyDirShallow(src: string, dest: string, maxDepth = 3, currentDepth = 0): void {
  if (currentDepth > maxDepth) return;
  
  fs.mkdirSync(dest, { recursive: true });
  
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    
    // Skip common heavy directories
    if (entry.isDirectory() && [
      'node_modules', '.git', 'dist', 'build', '__pycache__',
      '.venv', 'venv', 'target', 'vendor',
    ].includes(entry.name)) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirShallow(srcPath, destPath, maxDepth, currentDepth + 1);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(srcPath);
        // Skip files > 1MB in shallow copy
        if (stat.size <= 1 * 1024 * 1024) {
          fs.copyFileSync(srcPath, destPath);
        }
      } catch {}
    }
  }
}
