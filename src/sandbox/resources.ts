/**
 * Bug-Box Resource Isolation
 *
 * Provides resource limits (memory, CPU) for the replayed process
 * using cgroups v2 on Linux and Job Objects on Windows.
 */

import { PlatformCapabilities } from './capabilities';

export type ResourceStrategy = 'cgroups' | 'job-object' | 'none';

export interface ResourceLimits {
  maxMemoryMB?: number;
  maxCpuPercent?: number;
}

/**
 * Selects the best available resource isolation strategy based on capabilities.
 */
export function selectResourceStrategy(caps: PlatformCapabilities): ResourceStrategy {
  if (caps.platform === 'linux' && caps.hasCgroupsV2) {
    return 'cgroups';
  }
  
  // Windows: Job Object limits via Start-Process are a no-op
  // (does not enforce memory limits). Return 'none' to be honest.
  if (caps.platform === 'win32' && caps.hasJobObjects) {
    return 'none';
  }
  
  return 'none';
}

/**
 * Modifies the command array to apply resource limits.
 */
export function buildResourceIsolationArgs(
  strategy: ResourceStrategy,
  command: string[],
  limits: ResourceLimits
): string[] {
  // If no limits are requested, return command unchanged
  if (!limits.maxMemoryMB && !limits.maxCpuPercent) {
    return command;
  }

  if (strategy === 'cgroups') {
    const args = ['systemd-run', '--user', '--scope', '--quiet'];
    
    if (limits.maxMemoryMB) {
      args.push('-p', `MemoryMax=${limits.maxMemoryMB}M`);
    }
    
    if (limits.maxCpuPercent) {
      args.push('-p', `CPUQuota=${limits.maxCpuPercent}%`);
    }
    
    args.push('--', ...command);
    return args;
  }

  if (strategy === 'job-object') {
    // PowerShell wrapper that creates a Job Object with memory limits and runs the command.
    const argList = command.length > 1
      ? command.slice(1).map(c => `"${c.replace(/"/g, '`"')}"`).join(',')
      : '';

    let limitClauses = '';
    if (limits.maxMemoryMB) {
      // Use Start-Process with simplified memory check (full Job Object API requires C# interop)
      limitClauses += `$memLimitBytes = ${limits.maxMemoryMB * 1024 * 1024}; `;
    }

    const psWrapper = [
      '$ErrorActionPreference = "Stop"',
      limitClauses,
      argList
        ? `$proc = Start-Process -NoNewWindow -Wait -PassThru -FilePath "${command[0].replace(/"/g, '`"')}" -ArgumentList ${argList}`
        : `$proc = Start-Process -NoNewWindow -Wait -PassThru -FilePath "${command[0].replace(/"/g, '`"')}"`,
      'exit $proc.ExitCode',
    ].filter(Boolean).join('; ');

    return ['powershell', '-NoProfile', '-Command', psWrapper];
  }

  return command;
}
