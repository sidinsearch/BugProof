import { c, icons, banner, section, success, warn, error, info, kvLine, statusBadge } from '../../src/utils/ui';

describe('UI Output Utility', () => {
  describe('color functions', () => {
    it('should expose color functions that return strings', () => {
      expect(typeof c.bold('test')).toBe('string');
      expect(typeof c.red('test')).toBe('string');
      expect(typeof c.green('test')).toBe('string');
      expect(typeof c.cyan('test')).toBe('string');
      expect(typeof c.dim('test')).toBe('string');
      expect(typeof c.yellow('test')).toBe('string');
      expect(typeof c.blue('test')).toBe('string');
      expect(typeof c.magenta('test')).toBe('string');
      expect(typeof c.gray('test')).toBe('string');
      expect(typeof c.italic('test')).toBe('string');
    });

    it('should not throw when colors wrap empty strings', () => {
      expect(() => c.bold('')).not.toThrow();
      expect(() => c.red('')).not.toThrow();
    });
  });

  describe('icons', () => {
    it('should expose icon constants as strings', () => {
      expect(typeof icons.check).toBe('string');
      expect(typeof icons.cross).toBe('string');
      expect(typeof icons.bug).toBe('string');
      expect(typeof icons.arrow).toBe('string');
      expect(typeof icons.warning).toBe('string');
      expect(typeof icons.box).toBe('string');
      expect(typeof icons.dot).toBe('string');
      expect(typeof icons.divider).toBe('string');
      expect(typeof icons.corner).toBe('string');
      expect(typeof icons.cornerEnd).toBe('string');
      expect(typeof icons.line).toBe('string');
    });

    it('should have non-empty icon strings', () => {
      expect(icons.check.length).toBeGreaterThan(0);
      expect(icons.cross.length).toBeGreaterThan(0);
      expect(icons.bug.length).toBeGreaterThan(0);
    });
  });

  describe('output functions', () => {
    it('should not throw when calling banner with normal text', () => {
      expect(() => banner('Test')).not.toThrow();
    });

    it('should not throw when calling banner with empty text', () => {
      expect(() => banner('')).not.toThrow();
    });

    it('should not throw when calling section', () => {
      expect(() => section('Results')).not.toThrow();
    });

    it('should not throw when calling section with empty title', () => {
      expect(() => section('')).not.toThrow();
    });

    it('should not throw when calling output functions', () => {
      expect(() => success('ok')).not.toThrow();
      expect(() => warn('watch out')).not.toThrow();
      expect(() => error('bad')).not.toThrow();
      expect(() => info('fyi')).not.toThrow();
      expect(() => kvLine('key', 'value')).not.toThrow();
    });

    it('should not throw on empty messages', () => {
      expect(() => success('')).not.toThrow();
      expect(() => warn('')).not.toThrow();
      expect(() => error('')).not.toThrow();
      expect(() => info('')).not.toThrow();
      expect(() => kvLine('', '')).not.toThrow();
    });

    it('should not throw with multiline messages', () => {
      expect(() => success('line1\nline2')).not.toThrow();
      expect(() => error('line1\nline2\nline3')).not.toThrow();
    });
  });

  describe('statusBadge', () => {
    it('should not throw for true (pass)', () => {
      expect(() => statusBadge('Test passed', true)).not.toThrow();
    });

    it('should not throw for false (fail)', () => {
      expect(() => statusBadge('Test failed', false)).not.toThrow();
    });
  });
});
