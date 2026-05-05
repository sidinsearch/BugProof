/**
 * Bug-Box Platform Capabilities Detection
 *
 * Probes the current OS for available isolation primitives.
 * Each check is safe, unprivileged, and fast (<50ms per probe).
 * Results are used by bugbox.ts to decide which isolation layers to apply.
 */

import * as os from 'os';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

export interface PlatformCapabilities {
  /** Current OS: 'linux', 'win32', or 'darwin' */
  platform: NodeJS.Platform;
  /** Linux: can we run `unshare` for PID/network namespace isolation? */
  hasUnshare: boolean;
  /** Linux: is cgroups v2 available for resource limits? */
  hasCgroupsV2: boolean;
  /** Windows: Job Objects are always available for process/resource limits */
  hasJobObjects: boolean;
  /** Windows: can we create firewall rules via `netsh`? */
  hasNetsh: boolean;
  /** macOS: can we use `sandbox-exec` for profile-based sandboxing? */
  hasSandboxExec: boolean;
}

/**
 * Checks whether a command is available on the system PATH.
 * Uses `where` on Windows and `which` on Unix.
 * Never throws — returns false for any error.
 */
export function commandExists(name: string): boolean {
  if (!name || !name.trim()) return false;

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

/**
 * Detects which isolation primitives are available on the current platform.
 * Safe to call repeatedly — each call re-probes (no caching).
 */
export function detectCapabilities(): PlatformCapabilities {
  const platform = os.platform();

  return {
    platform,

    // Linux: check for `unshare` (user namespace isolation, no root needed)
    hasUnshare: platform === 'linux' && commandExists('unshare'),

    // Linux: check for cgroups v2 unified hierarchy
    hasCgroupsV2:
      platform === 'linux' &&
      fs.existsSync('/sys/fs/cgroup/cgroup.controllers'),

    // Windows: Job Objects are a built-in Win32 API, always available
    hasJobObjects: platform === 'win32',

    // Windows: netsh for firewall rules
    hasNetsh: platform === 'win32' && commandExists('netsh'),

    // macOS: sandbox-exec for profile-based sandboxing
    hasSandboxExec: platform === 'darwin' && commandExists('sandbox-exec'),
  };
}
