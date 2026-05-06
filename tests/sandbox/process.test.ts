import { selectProcessStrategy, buildProcessIsolationArgs } from '../../src/sandbox/process';
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

describe('Bug-Box Process Isolation', () => {
  describe('selectProcessStrategy', () => {
    it('should select "unshare" on Linux when available', () => {
      const caps = makeCaps({ platform: 'linux', hasUnshare: true });
      expect(selectProcessStrategy(caps)).toBe('unshare');
    });

    it('should select "none" on Linux when unshare is missing', () => {
      const caps = makeCaps({ platform: 'linux', hasUnshare: false });
      expect(selectProcessStrategy(caps)).toBe('none');
    });

    it('should select "none" on Windows (job objects handled in resources)', () => {
      const caps = makeCaps({ platform: 'win32', hasJobObjects: true });
      expect(selectProcessStrategy(caps)).toBe('none');
    });

    it('should select "none" on macOS', () => {
      const caps = makeCaps({ platform: 'darwin' });
      expect(selectProcessStrategy(caps)).toBe('none');
    });
  });

  describe('buildProcessIsolationArgs', () => {
    const cmd = ['npm', 'start'];

    it('should wrap command for unshare', () => {
      const result = buildProcessIsolationArgs('unshare', cmd);
      expect(result).toEqual(['unshare', '--pid', '--fork', '--mount-proc', '--', 'npm', 'start']);
    });

    it('should leave command unchanged for none', () => {
      const result = buildProcessIsolationArgs('none', cmd);
      expect(result).toEqual(cmd);
    });
  });
});
