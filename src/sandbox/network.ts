/**
 * Bug-Box Network Isolation
 *
 * Provides three strategies to prevent a replayed command from accessing the network:
 *
 *   - unshare (Linux):      wraps the command in `unshare --net`, creating a new
 *                            network namespace with only a loopback interface.
 *   - sandbox-exec (macOS): wraps the command in `sandbox-exec -p '(deny network*)'`.
 *   - netsh (Windows):      creates a temporary Windows Firewall rule before the
 *                            process starts and removes it after the process exits.
 *                            This is a pre/post approach, not a command wrapper.
 *   - none:                 no network isolation. Used when no primitive is available,
 *                            or when the user explicitly opts out.
 *
 * Design:
 *   selectNetworkStrategy()       — picks the best strategy for the current platform.
 *   buildNetworkIsolationArgs()   — transforms the command array (wrapping if needed).
 *   createNetworkCleanup()        — returns a cleanup function for post-exec teardown.
 */

import { PlatformCapabilities } from './capabilities';
import { spawnSync } from 'child_process';

/** The isolation approach selected for this platform. */
export type NetworkStrategy = 'unshare' | 'netsh' | 'sandbox-exec' | 'none';

/** Result of command transformation for network isolation. */
export interface NetworkIsolationResult {
  /** The (possibly wrapped) command array to spawn. */
  command: string[];
  /** If true, the caller must run pre-exec setup (e.g. netsh rule) before spawn. */
  needsPreExec: boolean;
  /** The strategy that was applied. */
  strategy: NetworkStrategy;
}

/**
 * Selects the best available network isolation strategy for the given platform.
 */
export function selectNetworkStrategy(caps: PlatformCapabilities): NetworkStrategy {
  switch (caps.platform) {
    case 'linux':
      return caps.hasUnshare ? 'unshare' : 'none';
    case 'win32':
      return caps.hasNetsh ? 'netsh' : 'none';
    case 'darwin':
      return caps.hasSandboxExec ? 'sandbox-exec' : 'none';
    default:
      return 'none';
  }
}

/**
 * Transforms a command array to include network isolation, if the strategy
 * supports command wrapping (unshare, sandbox-exec).
 *
 * For `netsh`, the command is returned unchanged because netsh uses firewall
 * rules applied before/after the process, not a wrapper.
 *
 * For `none`, the command is returned unchanged.
 */
export function buildNetworkIsolationArgs(
  strategy: NetworkStrategy,
  command: string[],
): NetworkIsolationResult {
  switch (strategy) {
    case 'unshare':
      return {
        // unshare --net creates a new network namespace with only loopback.
        // --map-root-user allows it to work without root (user namespace).
        command: ['unshare', '--net', '--map-root-user', '--', ...command],
        needsPreExec: false,
        strategy,
      };

    case 'sandbox-exec':
      return {
        // sandbox-exec with a deny-network profile.
        // The profile denies all network operations; the process can still
        // use local filesystem and IPC.
        command: [
          'sandbox-exec',
          '-p',
          '(version 1)(allow default)(deny network*)',
          '--',
          ...command,
        ],
        needsPreExec: false,
        strategy,
      };

    case 'netsh':
      // netsh doesn't wrap the command. The caller must call pre-exec setup
      // (addFirewallBlockRule) and post-exec cleanup (removeFirewallBlockRule).
      return {
        command,
        needsPreExec: true,
        strategy,
      };

    case 'none':
    default:
      return {
        command,
        needsPreExec: false,
        strategy,
      };
  }
}

/**
 * Creates a cleanup function that removes any network isolation artifacts
 * after the replayed process exits.
 *
 * - unshare / sandbox-exec: the kernel automatically tears down the namespace
 *   or sandbox when the process exits. Cleanup is a no-op.
 * - netsh: removes the temporary firewall rule by name.
 * - none: no-op.
 *
 * @param strategy  The isolation strategy that was applied.
 * @param ruleName  (netsh only) The firewall rule name to remove.
 */
export function createNetworkCleanup(
  strategy: NetworkStrategy,
  ruleName?: string,
): () => void {
  if (strategy === 'netsh' && ruleName) {
    return () => {
      try {
        spawnSync(
          'netsh',
          ['advfirewall', 'firewall', 'delete', 'rule', `name=${ruleName}`],
          { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' },
        );
      } catch {
        // Best effort — rule may not exist or we lack permissions
      }
    };
  }

  // All other strategies: kernel cleans up automatically, or nothing was applied
  return () => {};
}

/**
 * Adds a Windows Firewall rule that blocks all outbound traffic for a process.
 * Called as pre-exec for the `netsh` strategy.
 *
 * @param ruleName  Unique rule name for later cleanup.
 * @param exePath   Path to the executable to block.
 * @returns true if the rule was added, false on failure.
 */
export function addFirewallBlockRule(ruleName: string, exePath: string): boolean {
  const safeRuleName = sanitizeFirewallRuleName(ruleName);
  const safeExePath = sanitizeExecutablePath(exePath);
  if (!safeRuleName || !safeExePath) {
    return false;
  }

  try {
    const result = spawnSync(
      'netsh',
      [
        'advfirewall', 'firewall', 'add', 'rule',
        `name=${safeRuleName}`,
        'dir=out',
        'action=block',
        `program=${safeExePath}`,
      ],
      { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function sanitizeFirewallRuleName(value: string): string | null {
  if (!value || value.length > 120) {
    return null;
  }
  if (/[\r\n\t=]/.test(value)) {
    return null;
  }
  if (!/^[A-Za-z0-9 _.-]+$/.test(value)) {
    return null;
  }
  return value;
}

function sanitizeExecutablePath(value: string): string | null {
  if (!value || value.length > 260) {
    return null;
  }
  if (/[\r\n\0]/.test(value)) {
    return null;
  }
  if (/["<>|]/.test(value)) {
    return null;
  }
  return value;
}
