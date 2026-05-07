import {
  addFirewallBlockRule,
  buildNetworkIsolationArgs,
  createNetworkCleanup,
  NetworkIsolationResult,
  NetworkStrategy,
  selectNetworkStrategy,
} from '../../src/sandbox/network';
import { PlatformCapabilities } from '../../src/sandbox/capabilities';
import * as os from 'os';

// Helper: build a capabilities object for a specific platform
function makeCaps(overrides: Partial<PlatformCapabilities>): PlatformCapabilities {
  return {
    platform: 'linux',
    hasUnshare: false,
    hasCgroupsV2: false,
    hasJobObjects: false,
    hasNetsh: false,
    hasSandboxExec: false,
    ...overrides,
  };
}

describe('Bug-Box Network Isolation', () => {
  describe('selectNetworkStrategy', () => {
    it('should select "unshare" on Linux when unshare is available', () => {
      const caps = makeCaps({ platform: 'linux', hasUnshare: true });
      expect(selectNetworkStrategy(caps)).toBe('unshare');
    });

    it('should select "none" on Linux when unshare is not available', () => {
      const caps = makeCaps({ platform: 'linux', hasUnshare: false });
      expect(selectNetworkStrategy(caps)).toBe('none');
    });

    it('should select "netsh" on Windows when netsh is available', () => {
      const caps = makeCaps({ platform: 'win32', hasNetsh: true, hasJobObjects: true });
      expect(selectNetworkStrategy(caps)).toBe('netsh');
    });

    it('should select "none" on Windows when netsh is not available', () => {
      const caps = makeCaps({ platform: 'win32', hasNetsh: false, hasJobObjects: true });
      expect(selectNetworkStrategy(caps)).toBe('none');
    });

    it('should select "sandbox-exec" on macOS when sandbox-exec is available', () => {
      const caps = makeCaps({ platform: 'darwin', hasSandboxExec: true });
      expect(selectNetworkStrategy(caps)).toBe('sandbox-exec');
    });

    it('should select "none" on macOS when sandbox-exec is not available', () => {
      const caps = makeCaps({ platform: 'darwin', hasSandboxExec: false });
      expect(selectNetworkStrategy(caps)).toBe('none');
    });

    it('should select "none" for unknown platforms', () => {
      const caps = makeCaps({ platform: 'freebsd' as NodeJS.Platform });
      expect(selectNetworkStrategy(caps)).toBe('none');
    });
  });

  describe('buildNetworkIsolationArgs', () => {
    const testCommand = ['node', 'server.js'];

    it('should wrap command with unshare for "unshare" strategy', () => {
      const result = buildNetworkIsolationArgs('unshare', testCommand);
      expect(result.command[0]).toBe('unshare');
      expect(result.command).toContain('--net');
      // The original command should appear at the end
      expect(result.command.slice(-2)).toEqual(['node', 'server.js']);
    });

    it('should wrap command with sandbox-exec for "sandbox-exec" strategy', () => {
      const result = buildNetworkIsolationArgs('sandbox-exec', testCommand);
      expect(result.command[0]).toBe('sandbox-exec');
      // Should contain a deny-network profile
      expect(result.command.some(a => a.includes('deny') && a.includes('network'))).toBe(true);
      // Original command at the end
      expect(result.command.slice(-2)).toEqual(['node', 'server.js']);
    });

    it('should return the original command unchanged for "none" strategy', () => {
      const result = buildNetworkIsolationArgs('none', testCommand);
      expect(result.command).toEqual(testCommand);
    });

    it('should return the original command unchanged for "netsh" strategy (netsh is pre/post, not a wrapper)', () => {
      const result = buildNetworkIsolationArgs('netsh', testCommand);
      // netsh does not wrap the command; it creates firewall rules before/after
      expect(result.command).toEqual(testCommand);
    });

    it('should set needsPreExec=true for netsh strategy', () => {
      const result = buildNetworkIsolationArgs('netsh', testCommand);
      expect(result.needsPreExec).toBe(true);
    });

    it('should set needsPreExec=false for unshare strategy', () => {
      const result = buildNetworkIsolationArgs('unshare', testCommand);
      expect(result.needsPreExec).toBe(false);
    });

    it('should set needsPreExec=false for none strategy', () => {
      const result = buildNetworkIsolationArgs('none', testCommand);
      expect(result.needsPreExec).toBe(false);
    });

    it('should preserve multi-arg commands', () => {
      const cmd = ['python', '-m', 'pytest', '--verbose', '-x'];
      const result = buildNetworkIsolationArgs('none', cmd);
      expect(result.command).toEqual(cmd);
    });
  });

  describe('createNetworkCleanup', () => {
    it('should return a no-op function for "none" strategy', () => {
      const cleanup = createNetworkCleanup('none');
      expect(typeof cleanup).toBe('function');
      // Should not throw
      expect(() => cleanup()).not.toThrow();
    });

    it('should return a no-op function for "unshare" strategy (kernel cleans up namespace)', () => {
      const cleanup = createNetworkCleanup('unshare');
      expect(typeof cleanup).toBe('function');
      expect(() => cleanup()).not.toThrow();
    });

    it('should return a no-op function for "sandbox-exec" strategy (kernel cleans up sandbox)', () => {
      const cleanup = createNetworkCleanup('sandbox-exec');
      expect(typeof cleanup).toBe('function');
      expect(() => cleanup()).not.toThrow();
    });

    it('should return a function for "netsh" strategy', () => {
      const cleanup = createNetworkCleanup('netsh', 'bugbox-test-rule');
      expect(typeof cleanup).toBe('function');
      // We can't actually test the netsh call without admin,
      // but the function should exist and not throw
    });

    it('should not throw when called without a ruleName for netsh', () => {
      const cleanup = createNetworkCleanup('netsh');
      expect(() => cleanup()).not.toThrow();
    });
  });

  describe('addFirewallBlockRule', () => {
    it('should reject invalid rule names before spawning netsh', () => {
      expect(addFirewallBlockRule('bad\nrule', 'C:\\Program Files\\nodejs\\node.exe')).toBe(false);
      expect(addFirewallBlockRule('bad=rule', 'C:\\Program Files\\nodejs\\node.exe')).toBe(false);
    });

    it('should reject invalid executable paths before spawning netsh', () => {
      expect(addFirewallBlockRule('bugbox-net-test', 'C:\\Program Files\\nodejs\\node.exe\nnetsh')).toBe(false);
      expect(addFirewallBlockRule('bugbox-net-test', 'C:\\Program Files\\nodejs\\"node".exe')).toBe(false);
    });
  });
});
