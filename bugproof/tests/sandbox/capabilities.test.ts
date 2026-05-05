import { detectCapabilities, PlatformCapabilities, commandExists } from '../../src/sandbox/capabilities';
import * as os from 'os';

describe('Platform Capabilities Detection', () => {
  describe('detectCapabilities', () => {
    it('should return a PlatformCapabilities object with all required fields', () => {
      const caps = detectCapabilities();

      expect(caps).toHaveProperty('platform');
      expect(caps).toHaveProperty('hasUnshare');
      expect(caps).toHaveProperty('hasCgroupsV2');
      expect(caps).toHaveProperty('hasJobObjects');
      expect(caps).toHaveProperty('hasNetsh');
      expect(caps).toHaveProperty('hasSandboxExec');
    });

    it('should detect the correct platform', () => {
      const caps = detectCapabilities();
      expect(caps.platform).toBe(os.platform());
    });

    it('should return boolean values for all capability flags', () => {
      const caps = detectCapabilities();
      expect(typeof caps.hasUnshare).toBe('boolean');
      expect(typeof caps.hasCgroupsV2).toBe('boolean');
      expect(typeof caps.hasJobObjects).toBe('boolean');
      expect(typeof caps.hasNetsh).toBe('boolean');
      expect(typeof caps.hasSandboxExec).toBe('boolean');
    });

    it('should report hasJobObjects=true on Windows', () => {
      const caps = detectCapabilities();
      if (os.platform() === 'win32') {
        // Job Objects are always available on Windows
        expect(caps.hasJobObjects).toBe(true);
      }
    });

    it('should report hasUnshare=false on Windows', () => {
      const caps = detectCapabilities();
      if (os.platform() === 'win32') {
        // unshare is a Linux-only utility
        expect(caps.hasUnshare).toBe(false);
      }
    });

    it('should report hasCgroupsV2=false on Windows', () => {
      const caps = detectCapabilities();
      if (os.platform() === 'win32') {
        expect(caps.hasCgroupsV2).toBe(false);
      }
    });

    it('should report hasSandboxExec=false on non-macOS', () => {
      const caps = detectCapabilities();
      if (os.platform() !== 'darwin') {
        expect(caps.hasSandboxExec).toBe(false);
      }
    });

    it('should return consistent results on repeated calls', () => {
      const first = detectCapabilities();
      const second = detectCapabilities();
      expect(first).toEqual(second);
    });
  });

  describe('commandExists', () => {
    it('should return true for a command that exists (node)', () => {
      // Node.js is always available since we are running inside it
      expect(commandExists('node')).toBe(true);
    });

    it('should return false for a command that does not exist', () => {
      expect(commandExists('this_command_definitely_does_not_exist_abc123')).toBe(false);
    });

    it('should return true for git (required by BugProof)', () => {
      expect(commandExists('git')).toBe(true);
    });

    it('should not throw for any input', () => {
      expect(() => commandExists('')).not.toThrow();
      expect(() => commandExists('  ')).not.toThrow();
      expect(() => commandExists('--help')).not.toThrow();
    });
  });
});
