/**
 * Bug-Box Process Isolation
 *
 * Provides OS-level process namespace isolation so the replayed command
 * cannot see or signal host processes.
 */

import { PlatformCapabilities } from './capabilities';

export type ProcessStrategy = 'unshare' | 'none';

/**
 * Selects the best available process isolation strategy based on capabilities.
 */
export function selectProcessStrategy(caps: PlatformCapabilities): ProcessStrategy {
  if (caps.platform === 'linux' && caps.hasUnshare) {
    return 'unshare';
  }
  
  // Windows Job Objects provide resource limits but not true PID namespace hiding.
  // We handle Windows Job Objects in the resources layer instead.
  return 'none';
}

/**
 * Modifies the command array to run within a new process namespace.
 */
export function buildProcessIsolationArgs(strategy: ProcessStrategy, command: string[]): string[] {
  if (strategy === 'unshare') {
    // --pid: create new PID namespace
    // --fork: fork the new process (required for --pid)
    // --mount-proc: mount a new /proc filesystem so tools like `ps` work correctly
    return ['unshare', '--pid', '--fork', '--mount-proc', '--', ...command];
  }

  return command;
}
