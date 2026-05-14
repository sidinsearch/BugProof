import { selectResourceStrategy, buildResourceIsolationArgs } from '../../src/sandbox/resources';
import { PlatformCapabilities } from '../../src/sandbox/capabilities';

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

describe('Bug-Box Resource Isolation', () => {
  describe('selectResourceStrategy', () => {
    it('should select "cgroups" on Linux when available', () => {
      const caps = makeCaps({ platform: 'linux', hasCgroupsV2: true });
      expect(selectResourceStrategy(caps)).toBe('cgroups');
    });

    it('should select "none" on Windows (Job Object limits not implemented)', () => {
      const caps = makeCaps({ platform: 'win32', hasJobObjects: true });
      expect(selectResourceStrategy(caps)).toBe('none');
    });

    it('should select "none" when capabilities are missing', () => {
      const caps = makeCaps({ platform: 'linux', hasCgroupsV2: false });
      expect(selectResourceStrategy(caps)).toBe('none');
    });
  });

  describe('buildResourceIsolationArgs', () => {
    const cmd = ['node', 'script.js'];

    it('should wrap command with systemd-run for cgroups if limits provided', () => {
      const result = buildResourceIsolationArgs('cgroups', cmd, { maxMemoryMB: 256, maxCpuPercent: 50 });
      expect(result).toEqual([
        'systemd-run', '--user', '--scope', '--quiet',
        '-p', 'MemoryMax=256M',
        '-p', 'CPUQuota=50%',
        '--', 'node', 'script.js'
      ]);
    });

    it('should wrap command with powershell for job-object if limits provided', () => {
      const result = buildResourceIsolationArgs('job-object', cmd, { maxMemoryMB: 256 });
      expect(result[0]).toBe('powershell');
      expect(result[1]).toBe('-NoProfile');
      expect(result[2]).toBe('-Command');
      expect(result[3]).toContain('Start-Process');
      expect(result[3]).toContain('node');
    });

    it('should leave command unchanged if no limits provided', () => {
      const result = buildResourceIsolationArgs('cgroups', cmd, {});
      expect(result).toEqual(cmd);
    });

    it('should leave command unchanged for none', () => {
      const result = buildResourceIsolationArgs('none', cmd, { maxMemoryMB: 256 });
      expect(result).toEqual(cmd);
    });
  });
});
