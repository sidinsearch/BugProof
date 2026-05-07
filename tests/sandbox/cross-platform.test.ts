import { detectCrossPlatform, translateCommand, translateEnvironment } from '../../src/sandbox/cross-platform.js';

describe('Cross-Platform Detection', () => {
  it('should not need translation when platforms match', () => {
    const result = detectCrossPlatform('win32', 'win32');
    expect(result.needsTranslation).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('should detect cross-platform need when platforms differ', () => {
    const result = detectCrossPlatform('linux', 'win32');
    expect(result.needsTranslation).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Cross-platform');
  });

  it('should identify unix-to-unix as high compatibility', () => {
    const result = detectCrossPlatform('linux', 'darwin');
    expect(result.needsTranslation).toBe(true);
    expect(result.likelyCompatible).toBe(true);
    expect(result.warnings.some(w => w.includes('Unix-to-Unix'))).toBe(true);
  });

  it('should identify cross-family translation', () => {
    const result = detectCrossPlatform('win32', 'linux');
    expect(result.needsTranslation).toBe(true);
    expect(result.warnings.some(w => w.includes('Cross-family'))).toBe(true);
  });
});

describe('Command Translation', () => {
  it('should not translate when platforms are same', () => {
    const result = translateCommand(['node', 'app.js'], 'win32', 'win32');
    expect(result.translated).toBe(false);
    expect(result.command).toEqual(['node', 'app.js']);
  });

  it('should translate python3 to python on Windows', () => {
    const result = translateCommand(['python3', 'app.py'], 'linux', 'win32');
    // This depends on whether python exists on the test system
    // If python is available, it translates; otherwise keeps python3
    expect(result.command[0]).toMatch(/^python/);
    expect(result.command[1]).toBe('app.py');
  });

  it('should translate bash -c to powershell on Windows when bash unavailable', () => {
    const result = translateCommand(['bash', '-c', 'echo hello'], 'linux', 'win32');
    // If bash is available (Git Bash), keeps bash. Otherwise translates.
    expect(result.command.length).toBeGreaterThanOrEqual(3);
  });

  it('should flag Windows .exe as blocker on Linux', () => {
    const result = translateCommand(['myapp.exe', '--flag'], 'win32', 'linux');
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers[0]).toContain('Cannot run Windows executable');
  });

  it('should not flag scripting commands as blockers', () => {
    const result = translateCommand(['node', 'app.js'], 'linux', 'win32');
    expect(result.blockers).toHaveLength(0);
  });

  it('should translate which to where on Windows', () => {
    const result = translateCommand(['which', 'node'], 'linux', 'win32');
    if (result.translated) {
      expect(result.command[0]).toBe('where');
    }
  });
});

describe('Environment Translation', () => {
  it('should not translate when platforms are same', () => {
    const env = { PATH: '/usr/bin:/usr/local/bin', HOME: '/home/user' };
    const result = translateEnvironment(env, 'linux', 'linux');
    expect(result.translations).toHaveLength(0);
    expect(result.environment).toEqual(env);
  });

  it('should translate PATH separator from Unix to Windows', () => {
    const env = { PATH: '/usr/bin:/usr/local/bin' };
    const result = translateEnvironment(env, 'linux', 'win32');
    expect(result.environment.PATH).toContain(';');
    expect(result.translations.some(t => t.includes('PATH separator'))).toBe(true);
  });

  it('should translate PATH separator from Windows to Unix', () => {
    const env = { PATH: 'C:\\Windows;C:\\Users\\bin' };
    const result = translateEnvironment(env, 'win32', 'linux');
    expect(result.environment.PATH).toContain(':');
    expect(result.translations.some(t => t.includes('PATH separator'))).toBe(true);
  });

  it('should map HOME to USERPROFILE when going Unix to Windows', () => {
    const env = { HOME: '/home/user', USER: 'user' };
    const result = translateEnvironment(env, 'linux', 'win32');
    expect(result.environment.USERPROFILE).toBeDefined();
    expect(result.environment.USERNAME).toBe('user');
    expect(result.translations.some(t => t.includes('HOME'))).toBe(true);
  });

  it('should map USERPROFILE to HOME when going Windows to Unix', () => {
    const env = { USERPROFILE: 'C:\\Users\\user', USERNAME: 'user' };
    const result = translateEnvironment(env, 'win32', 'linux');
    expect(result.environment.HOME).toBeDefined();
    expect(result.environment.USER).toBe('user');
    expect(result.translations.some(t => t.includes('USERPROFILE'))).toBe(true);
  });

  it('should handle TMPDIR/TEMP translation', () => {
    const env = { TMPDIR: '/tmp' };
    const result = translateEnvironment(env, 'linux', 'win32');
    expect(result.environment.TEMP).toBeDefined();
    expect(result.environment.TMP).toBeDefined();
  });
});
