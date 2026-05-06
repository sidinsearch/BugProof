import { c, icons, banner, success, warn, error, info, kvLine } from '../../src/utils/ui';

describe('UI Output Utility', () => {
  it('should expose color functions that return strings', () => {
    expect(typeof c.bold('test')).toBe('string');
    expect(typeof c.red('test')).toBe('string');
    expect(typeof c.green('test')).toBe('string');
    expect(typeof c.cyan('test')).toBe('string');
    expect(typeof c.dim('test')).toBe('string');
  });

  it('should expose icon constants as strings', () => {
    expect(typeof icons.check).toBe('string');
    expect(typeof icons.cross).toBe('string');
    expect(typeof icons.bug).toBe('string');
    expect(typeof icons.arrow).toBe('string');
  });

  it('should not throw when calling output functions', () => {
    // These write to stdout; just verify they don't crash
    expect(() => banner('Test')).not.toThrow();
    expect(() => success('ok')).not.toThrow();
    expect(() => warn('watch out')).not.toThrow();
    expect(() => error('bad')).not.toThrow();
    expect(() => info('fyi')).not.toThrow();
    expect(() => kvLine('key', 'value')).not.toThrow();
  });
});
