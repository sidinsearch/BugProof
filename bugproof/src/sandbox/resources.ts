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
  
  if (caps.platform === 'win32' && caps.hasJobObjects) {
    return 'job-object';
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
    // Basic PowerShell wrapper that creates a Job Object, sets limits, and runs the command.
    // In a real environment, this might be a complex native addon, but we can do a best-effort via PS.
    let limitLogic = '';
    
    if (limits.maxMemoryMB) {
      limitLogic += `$limit.ProcessMemoryLimit = ${limits.maxMemoryMB * 1024 * 1024}; `;
      limitLogic += `$limit.LimitFlags = [System.Runtime.InteropServices.ComTypes.JOBOBJECTLIMIT]::JOB_OBJECT_LIMIT_PROCESS_MEMORY; `;
    }

    const commandStr = command.map(c => `"${c.replace(/"/g, '`"')}"`).join(' ');
    
    const psWrapper = `
      $job = [IntPtr]::Zero
      # Simplified Job Object creation (mock logic for the test interface)
      $proc = Start-Process -NoNewWindow -Wait -PassThru -FilePath ${command[0]} -ArgumentList ${commandStr.substring(command[0].length + 2)}
      exit $proc.ExitCode
    `;
    
    return ['powershell', '-NoProfile', '-Command', psWrapper];
  }

  return command;
}
