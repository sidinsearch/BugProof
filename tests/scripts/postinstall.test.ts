const { isSafeWindowsPath, quoteForWindowsCommand } = require('../../scripts/postinstall.cjs');

describe('postinstall Windows registry command escaping', () => {
  it('accepts normal Windows paths', () => {
    expect(isSafeWindowsPath('C:\\Program Files\\nodejs\\node.exe')).toBe(true);
  });

  it('rejects unsafe Windows paths with control chars', () => {
    expect(isSafeWindowsPath('C:\\node.exe\nreg add HKCU\\Bad')).toBe(false);
    expect(isSafeWindowsPath('C:\\node.exe\r\nfoo')).toBe(false);
  });

  it('quotes paths for command values', () => {
    const quoted = quoteForWindowsCommand('C:\\Program Files\\nodejs\\node.exe');
    expect(quoted).toBe('"C:\\Program Files\\nodejs\\node.exe"');
  });

  it('escapes internal quotes', () => {
    const quoted = quoteForWindowsCommand('C:\\Path\\my"tool".exe');
    expect(quoted).toContain('\\"tool\\"');
  });

  it('throws on unsafe path input', () => {
    expect(() => quoteForWindowsCommand('C:\\node.exe\nreg add x')).toThrow('Unsafe Windows path');
  });
});
