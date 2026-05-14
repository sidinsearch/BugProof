/**
 * BugBox Container — Lightweight process isolation without Docker
 *
 * Uses native OS primitives per platform:
 *   Linux:   unshare (user+pid+mount+net namespaces), cgroups v2, fuse-overlayfs
 *   Windows: Job Objects, netsh firewall rules
 *   macOS:   sandbox-exec
 *
 * No daemon, no images, no root required (Linux user namespaces are unprivileged).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { detectCapabilities, PlatformCapabilities } from './capabilities.js';
import { addFirewallBlockRule } from './network.js';

export interface ContainerConfig {
  command: string[];
  workingDir: string;
  environment: Record<string, string>;
  timeoutMs: number;
  limits?: {
    maxMemoryMB?: number;
    maxCpuPercent?: number;
    maxPids?: number;
  };
  network: 'none' | 'loopback' | 'full';
  filesystem: 'readonly' | 'overlay' | 'full';
}

export interface ContainerResult {
  command: string[];
  environment: Record<string, string>;
  workingDir: string;
  layersApplied: string[];
  layersFailed: string[];
  cleanup: () => void;
  description: string;
}

export function createContainer(config: ContainerConfig): ContainerResult {
  const caps = detectCapabilities();
  const layersApplied: string[] = [];
  const layersFailed: string[] = [];
  let command = [...config.command];
  let environment = { ...config.environment };
  let workingDir = config.workingDir;
  const cleanupFns: (() => void)[] = [];

  const containerTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bugbox-container-'));
  cleanupFns.push(() => {
    try { fs.rmSync(containerTmp, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  });

  environment.TMPDIR = containerTmp;
  environment.TMP = containerTmp;
  environment.TEMP = containerTmp;
  layersApplied.push('temp-isolation');

  if (config.filesystem === 'overlay' || config.filesystem === 'readonly') {
    const overlayResult = createWorkspaceOverlay(config.workingDir, containerTmp, caps);
    if (overlayResult.applied) {
      workingDir = overlayResult.workingDir;
      cleanupFns.push(overlayResult.cleanup);
      layersApplied.push('filesystem-overlay');
    } else {
      layersFailed.push('filesystem-overlay');
    }
  }

  environment = sanitizeContainerEnv(environment);
  layersApplied.push('env-sanitize');

  if (caps.platform === 'linux') {
    const linuxResult = applyLinuxIsolation(command, caps, config);
    command = linuxResult.command;
    layersApplied.push(...linuxResult.applied);
    layersFailed.push(...linuxResult.failed);
    cleanupFns.push(...linuxResult.cleanupFns);
  } else if (caps.platform === 'win32') {
    const winResult = applyWindowsIsolation(command, caps, config);
    command = winResult.command;
    layersApplied.push(...winResult.applied);
    layersFailed.push(...winResult.failed);
    cleanupFns.push(...winResult.cleanupFns);
  } else if (caps.platform === 'darwin') {
    const macResult = applyMacIsolation(command, caps, config, workingDir, containerTmp);
    command = macResult.command;
    layersApplied.push(...macResult.applied);
    layersFailed.push(...macResult.failed);
  }

  const total = layersApplied.length + layersFailed.length;
  const description = `BugBox container: ${layersApplied.length}/${total} isolation layers active (${caps.platform})`;

  return {
    command,
    environment,
    workingDir,
    layersApplied,
    layersFailed,
    cleanup: () => {
      for (const fn of cleanupFns.reverse()) {
        try { fn(); } catch { /* cleanup best-effort */ }
      }
    },
    description,
  };
}

// ── Workspace Overlay ──

interface OverlayResult {
  applied: boolean;
  workingDir: string;
  cleanup: () => void;
}

function createWorkspaceOverlay(
  sourceDir: string,
  containerTmp: string,
  caps: PlatformCapabilities,
): OverlayResult {
  if (caps.platform === 'linux') {
    const upperDir = path.join(containerTmp, 'upper');
    const workDir = path.join(containerTmp, 'work');
    const mergedDir = path.join(containerTmp, 'merged');

    fs.mkdirSync(upperDir, { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(mergedDir, { recursive: true });

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
          cleanup: () => { spawnSync('fusermount', ['-u', mergedDir], { timeout: 5000 }); },
        };
      }
    }
  }

  const workspaceDir = path.join(containerTmp, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });
  copyDirShallow(sourceDir, workspaceDir);
  return { applied: true, workingDir: workspaceDir, cleanup: () => {} };
}

// ── Linux Isolation ──

function applyLinuxIsolation(
  command: string[],
  caps: PlatformCapabilities,
  config: ContainerConfig,
): { command: string[]; applied: string[]; failed: string[]; cleanupFns: (() => void)[] } {
  const applied: string[] = [];
  const failed: string[] = [];
  const cleanupFns: (() => void)[] = [];
  let cmd = [...command];

  if (caps.hasUnshare) {
    const unshareArgs = ['unshare', '--user', '--map-root-user', '--pid', '--fork', '--mount'];
    applied.push('user-namespace', 'pid-namespace', 'mount-namespace');

    if (config.network === 'none' || config.network === 'loopback') {
      unshareArgs.push('--net');
      applied.push('network-namespace');
    } else {
      failed.push('network-namespace');
    }

    unshareArgs.push('--');
    cmd = [...unshareArgs, ...cmd];
  } else {
    failed.push('namespaces');
  }

  if (caps.hasCgroupsV2 && config.limits && (config.limits.maxMemoryMB || config.limits.maxCpuPercent)) {
    const args = ['systemd-run', '--user', '--scope', '--quiet'];
    if (config.limits.maxMemoryMB) args.push('-p', `MemoryMax=${config.limits.maxMemoryMB}M`);
    if (config.limits.maxCpuPercent) args.push('-p', `CPUQuota=${config.limits.maxCpuPercent}%`);
    if (config.limits.maxPids) args.push('-p', `TasksMax=${config.limits.maxPids}`);
    args.push('--');
    cmd = [...args, ...cmd];
    applied.push('resource-limits');
  }

  return { command: cmd, applied, failed, cleanupFns };
}

// ── Windows Isolation ──

function applyWindowsIsolation(
  command: string[],
  caps: PlatformCapabilities,
  config: ContainerConfig,
): { command: string[]; applied: string[]; failed: string[]; cleanupFns: (() => void)[] } {
  const applied: string[] = [];
  const failed: string[] = [];
  const cleanupFns: (() => void)[] = [];
  const cmd = [...command];

  if (caps.hasJobObjects && config.limits?.maxMemoryMB) {
    failed.push('job-object');
  }

  if (config.network === 'none' && caps.hasNetsh) {
    const ruleName = `bugbox-${Date.now()}`;
    if (addFirewallBlockRule(ruleName, command[0])) {
      applied.push('network-firewall');
      cleanupFns.push(() => {
        spawnSync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${ruleName}`],
          { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
      });
    } else {
      failed.push('network-firewall');
    }
  }

  return { command: cmd, applied, failed, cleanupFns };
}

// ── macOS Isolation ──

function applyMacIsolation(
  command: string[],
  caps: PlatformCapabilities,
  config: ContainerConfig,
  workingDir: string,
  containerTmp: string,
): { command: string[]; applied: string[]; failed: string[] } {
  const applied: string[] = [];
  const failed: string[] = [];
  let cmd = [...command];

  if (caps.hasSandboxExec) {
    const profileParts = ['(version 1)', '(allow default)'];

    if (config.network === 'none') {
      profileParts.push('(deny network*)');
      applied.push('network-sandbox');
    }

    if (config.filesystem !== 'full') {
      profileParts.push(
        `(deny file-write* (subpath "/"))`,
        `(allow file-write* (subpath "${workingDir}"))`,
        `(allow file-write* (subpath "${containerTmp}"))`
      );
      applied.push('fs-sandbox');
    }

    cmd = ['sandbox-exec', '-p', profileParts.join(''), '--', ...cmd];
    applied.push('sandbox-exec');
  } else {
    failed.push('sandbox');
  }

  return { command: cmd, applied, failed };
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
  'BASH_ENV', 'ENV', 'PROMPT_COMMAND', 'IFS',
  'SHELLOPTS', 'BASHOPTS',
  'LD_AUDIT', 'LD_DEBUG',
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
        } else {
          process.stderr.write(`  [bugbox] Skipping large file in workspace overlay: ${entry.name} (${(stat.size / 1024 / 1024).toFixed(1)} MB)\n`);
        }
      } catch {
        // Ignore copy errors for large files or permission issues
      }
    }
  }
}
