import { detectCrossPlatform, translateCommand, translateEnvironment } from '../../src/sandbox/cross-platform.js';

// ── detectCrossPlatform ──

describe('detectCrossPlatform', () => {
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

  it('should warn on architecture mismatch', () => {
    const result = detectCrossPlatform('linux', 'linux', 'x64', 'arm64');
    expect(result.warnings.some(w => w.includes('Architecture mismatch'))).toBe(true);
  });

  it('should mention Rosetta for macOS x64→arm64', () => {
    const result = detectCrossPlatform('darwin', 'darwin', 'x64', 'arm64');
    const all = result.warnings.join(' ');
    expect(all).toContain('Rosetta');
  });

  it('should handle all 5 cross-family combinations without error', () => {
    const combos: [string, string][] = [
      ['win32', 'linux'], ['win32', 'darwin'],
      ['linux', 'win32'], ['darwin', 'win32'],
      ['win32', 'win32'],
    ];
    for (const [from, to] of combos) {
      const r = detectCrossPlatform(from, to);
      expect(typeof r.needsTranslation).toBe('boolean');
      expect(typeof r.likelyCompatible).toBe('boolean');
      expect(Array.isArray(r.warnings)).toBe(true);
    }
  });
});

// ── Command Translation: Executables ──

describe('translateCommand — executables', () => {
  it('should not translate when platforms are same', () => {
    const result = translateCommand(['node', 'app.js'], 'win32', 'win32');
    expect(result.translated).toBe(false);
    expect(result.command).toEqual(['node', 'app.js']);
  });

  it('should translate python3 to python on Windows', () => {
    const result = translateCommand(['python3', 'app.py'], 'linux', 'win32');
    expect(result.command[0]).toMatch(/^python/);
    expect(result.command[1]).toBe('app.py');
  });

  it('should translate which to where on Windows', () => {
    const result = translateCommand(['which', 'node'], 'linux', 'win32');
    if (result.translated) {
      expect(result.command[0]).toBe('where');
    }
  });

  it('should translate ls to dir on Windows', () => {
    const result = translateCommand(['ls', '-la'], 'linux', 'win32');
    if (result.translated) {
      expect(result.command[0]).toBe('dir');
    }
  });

  it('should translate cls to clear on Unix', () => {
    const result = translateCommand(['cls'], 'win32', 'linux');
    if (result.translated) {
      expect(result.command[0]).toBe('clear');
    }
  });

  it('should translate open between platforms', () => {
    const winResult = translateCommand(['open', 'file.txt'], 'darwin', 'win32');
    if (winResult.translated) expect(winResult.command[0]).toBe('start');

    const linuxResult = translateCommand(['open', 'file.txt'], 'darwin', 'linux');
    if (linuxResult.translated) expect(linuxResult.command[0]).toBe('xdg-open');
  });

  it('should translate cat to type on Windows', () => {
    const result = translateCommand(['cat', 'file.txt'], 'linux', 'win32');
    if (result.translated) {
      expect(result.command[0]).toBe('type');
    }
  });

  it('should flag Windows .exe as blocker on Linux', () => {
    const result = translateCommand(['myapp.exe', '--flag'], 'win32', 'linux');
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers[0]).toContain('Cannot run Windows executable');
  });

  it('should flag Windows .exe as blocker on macOS', () => {
    const result = translateCommand(['myapp.exe', '--flag'], 'win32', 'darwin');
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers[0]).toContain('Cannot run Windows executable');
  });

  it('should not flag scripting commands as blockers', () => {
    const result = translateCommand(['node', 'app.js'], 'linux', 'win32');
    expect(result.blockers).toHaveLength(0);
  });

  it('should translate gradlew to gradlew.bat on Windows (if bat exists in PATH)', () => {
    const result = translateCommand(['gradlew', 'build'], 'linux', 'win32');
    if (result.translated) {
      expect(result.command[0]).toBe('gradlew.bat');
    }
  });

  it('should not flag any shell/scripting commands for Linux→Win32 ELF false positives', () => {
    const cmds = ['node', 'python', 'npm', 'git', 'bash'];
    for (const cmd of cmds) {
      const result = translateCommand([cmd, 'foo'], 'linux', 'win32');
      expect(result.blockers).toHaveLength(0);
    }
  });

  it('should translate git operations unchanged', () => {
    const result = translateCommand(['git', 'log'], 'linux', 'win32');
    expect(result.command[0]).toBe('git');
    expect(result.blockers).toHaveLength(0);
  });

  it('should return untranslated for unknown commands on same-family OS', () => {
    const result = translateCommand(['some-unknown-tool', 'arg'], 'linux', 'darwin');
    expect(result.translated).toBe(false);
    expect(result.command[0]).toBe('some-unknown-tool');
  });
});

// ── Command Translation: Shell Wrappers ──

describe('translateCommand — shell wrappers', () => {
  it('should handle bash -c on Windows (may keep bash if available)', () => {
    const result = translateCommand(['bash', '-c', 'echo hello'], 'linux', 'win32');
    expect(result.command.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle cmd /c on Unix', () => {
    const result = translateCommand(['cmd', '/c', 'echo hello'], 'win32', 'linux');
    expect(result.command[0]).toBe('bash');
    expect(result.command[1]).toBe('-c');
    expect(result.translations.some(t => t.includes('cmd'))).toBe(true);
  });

  it('should handle cmd /C on Unix (uppercase flag)', () => {
    const result = translateCommand(['cmd', '/C', 'echo hello'], 'win32', 'linux');
    expect(result.command[0]).toBe('bash');
    expect(result.command[1]).toBe('-c');
  });

  it('should handle powershell -Command on Unix', () => {
    const result = translateCommand(['powershell', '-Command', 'Write-Host hello'], 'win32', 'linux');
    expect(result.command[0]).toBe('bash');
    expect(result.command[1]).toBe('-c');
    expect(result.translations.some(t => t.includes('powershell'))).toBe(true);
  });

  it('should handle pwsh -c on Unix', () => {
    const result = translateCommand(['pwsh', '-c', 'ls'], 'win32', 'linux');
    expect(result.command[0]).toBe('bash');
    expect(result.command[1]).toBe('-c');
  });

  it('should not modify shell wrappers on same platform', () => {
    const result = translateCommand(['cmd', '/c', 'echo hi'], 'win32', 'win32');
    expect(result.translated).toBe(false);
    expect(result.command).toEqual(['cmd', '/c', 'echo hi']);
  });

  it('should not modify non-shell commands', () => {
    const result = translateCommand(['node', '-e', 'console.log("hi")'], 'linux', 'win32');
    expect(result.blockers).toHaveLength(0);
  });
});

// ── Command Translation: Path Arguments ──

describe('translateCommand — path arguments', () => {
  it('should translate C:\\Users\\Public to /var/public/ on Win→Linux', () => {
    // /Users/ is the path after drive-letter strip; /users/public is matched first
    const result = translateCommand(['node', 'C:\\Users\\Public\\test.js'], 'win32', 'linux');
    const p = result.command[1];
    expect(p).toMatch(/^\/var\/public\/test\.js$/i);
  });

  it('should translate C:\\Users\\user to /home/user/ on Win→Linux', () => {
    const result = translateCommand(['node', 'C:\\Users\\foo\\app.js'], 'win32', 'linux');
    const p = result.command[1];
    expect(p).toMatch(/^\/home\/.*app\.js$/);
  });

  it('should translate Unix path to Windows with backslash and C:\\Users\\', () => {
    const result = translateCommand(['node', '/home/user/project/app.js'], 'linux', 'win32');
    const p = result.command[1];
    expect(p).toContain('\\');
    expect(p).toMatch(/^C:\\Users\\/);
  });

  it('should translate /tmp to C:\\Temp\\ on Linux→Win', () => {
    const result = translateCommand(['cat', '/tmp/log.txt'], 'linux', 'win32');
    const p = result.command[1];
    expect(p).toMatch(/^C:\\Temp\\/i);
  });

  it('should translate C:\\Program Files\\ to /opt/ on Win→Unix', () => {
    const result = translateCommand(['node', 'C:\\Program Files\\node\\node.exe'], 'win32', 'linux');
    const p = result.command[1];
    expect(p).toMatch(/^\/opt\//i);
  });

  it('should handle C:\\Program Files (x86)\\', () => {
    const result = translateCommand(['node', 'C:\\Program Files (x86)\\app\\tool.exe'], 'win32', 'linux');
    const p = result.command[1];
    expect(p).toMatch(/^\/opt\//i);
  });

  it('should pass through non-path args unmodified', () => {
    const result = translateCommand(['node', '--version'], 'win32', 'linux');
    expect(result.command[1]).toBe('--version');
  });

  it('should convert path separators in relative paths (Unix→Win)', () => {
    const result = translateCommand(['node', './app.js'], 'linux', 'win32');
    expect(result.command[1]).toBe('.\\app.js');
  });

  it('should handle multiple path args', () => {
    const result = translateCommand(
      ['diff', '/home/a/file.txt', '/home/b/file.txt'],
      'linux', 'win32',
    );
    expect(result.command[1]).toContain('C:');
    expect(result.command[2]).toContain('C:');
  });
});

// ── Environment Translation ──

describe('translateEnvironment', () => {
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

  it('should not overwrite existing HOME when going Win→Unix and HOME exists', () => {
    const env = { USERPROFILE: 'C:\\Users\\user', HOME: '/existing/home' };
    const result = translateEnvironment(env, 'win32', 'linux');
    expect(result.environment.HOME).toBe('/existing/home');
  });

  it('should handle TMPDIR/TEMP translation', () => {
    const env = { TMPDIR: '/tmp' };
    const result = translateEnvironment(env, 'linux', 'win32');
    expect(result.environment.TEMP).toBeDefined();
    expect(result.environment.TMP).toBeDefined();
  });

  it('should translate TEMP/TMP to TMPDIR on Win→Unix', () => {
    const env = { TEMP: 'C:\\Temp', TMP: 'C:\\Temp' };
    const result = translateEnvironment(env, 'win32', 'linux');
    expect(result.environment.TMPDIR).toBeDefined();
  });

  it('should map APPDATA to XDG_CONFIG_HOME on Win→Unix', () => {
    const env = { APPDATA: 'C:\\Users\\user\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\user' };
    const result = translateEnvironment(env, 'win32', 'linux');
    expect(result.environment.XDG_CONFIG_HOME).toBeDefined();
    expect(result.translations.some(t => t.includes('APPDATA'))).toBe(true);
  });

  it('should translate path values in all env vars (not just known ones)', () => {
    const env = {
      MY_CONFIG: 'C:\\Users\\user\\config.json',
      BUILD_DIR: 'C:\\Projects\\build',
    };
    const result = translateEnvironment(env, 'win32', 'linux');
    expect(result.environment.MY_CONFIG).toMatch(/^\//);
    expect(result.environment.MY_CONFIG).not.toContain('\\');
    expect(result.environment.BUILD_DIR).toMatch(/^\//);
  });

  it('should not add duplicate env vars when source key doesnt exist', () => {
    const env = { HOME: '/home/user' };
    const result = translateEnvironment(env, 'linux', 'win32');
    expect(result.environment.XDG_CONFIG_HOME).toBeUndefined();
  });

  it('should not corrupt non-path env var values', () => {
    const env = { NODE_ENV: 'production', DEBUG: 'true', COUNT: '42' };
    const result = translateEnvironment(env, 'linux', 'win32');
    expect(result.environment.NODE_ENV).toBe('production');
    expect(result.environment.DEBUG).toBe('true');
    expect(result.environment.COUNT).toBe('42');
  });

  it('should preserve keys not in standard mapping', () => {
    const env = { CUSTOM_PATH: '/some/weird/path' };
    const result = translateEnvironment(env, 'linux', 'win32');
    expect(result.environment.CUSTOM_PATH).toBeDefined();
  });
});

// ── Edge Cases ──

describe('cross-platform edge cases', () => {
  it('should translate C:\\Users\\Public via known-paths table', () => {
    const result = translateCommand(['cat', 'C:\\Users\\Public\\document.txt'], 'win32', 'linux');
    expect(result.command[1]).toMatch(/^\/var\/public\/document\.txt$/i);
  });

  it('should translate C:\\Windows\\ through known-paths table', () => {
    const result = translateCommand(['node', 'C:\\Windows\\System32\\config'], 'win32', 'linux');
    expect(result.command[1]).toMatch(/^\/usr\/system32\/config$/i);
  });

  it('should pass through unmapped paths unchanged (non-English Windows)', () => {
    const result = translateCommand(['node', 'C:\\Benutzer\\user\\app.js'], 'win32', 'linux');
    const p = result.command[1];
    expect(p).toContain('Benutzer');
    expect(p).toMatch(/^\/benutzer\/user\/app\.js$/i);
  });

  it('should normalize UNC paths with slash conversion', () => {
    const result = translateCommand(['node', '\\\\server\\share\\path'], 'win32', 'linux');
    const p = result.command[1];
    expect(p).toMatch(/^\/\/server\/share\/path/);
  });

  it('should pass through non-English Linux paths when going to Windows', () => {
    const result = translateCommand(['ls', '/data/projects/my_app'], 'linux', 'win32');
    const p = result.command[1];
    expect(p).toContain('data');
    expect(p).toContain('projects');
    expect(p).toContain('my_app');
  });

  it('should handle drive letters D:, E:, etc. gracefully', () => {
    const result = translateCommand(['node', 'D:\\Data\\project\\app.js'], 'win32', 'linux');
    const p = result.command[1];
    expect(p).not.toContain('D:');
    expect(p).toMatch(/^\/data\/project\/app\.js$/i);
  });

  it('should translate /opt path on Linux→Win', () => {
    const result = translateCommand(['ls', '/opt/someapp/bin'], 'linux', 'win32');
    const p = result.command[1];
    expect(p).toMatch(/^C:\\Program Files\\/i);
  });

  it('should return blockers and translations arrays even when not translated', () => {
    const result = translateCommand(['node', 'app.js'], 'win32', 'win32');
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.translations)).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.translations).toHaveLength(0);
  });

  // Regression: lowered was computed before backslash→slash conversion,
  // so Win→Unix known-paths like /users/ never matched C:\Users\...
  it('Win→Unix: known-paths should match after backslash normalization', () => {
    const result = translateCommand(['node', 'C:\\Users\\Public\\test.js'], 'win32', 'linux');
    expect(result.command[1]).toMatch(/^\/var\/public\/test\.js$/i);
  });

  // Regression: Unix→Win known-paths were matched after backslash reversal,
  // so /home/ never matched C:\Users\
  it('Unix→Win: known-paths should match before backslash reversal', () => {
    const result = translateCommand(['node', '/home/user/app.js'], 'linux', 'win32');
    const p = result.command[1];
    expect(p).toMatch(/^C:\\Users\\/);
    expect(p).not.toContain('/home/');
  });

  // Regression: bash/sh/zsh/fish/powershell/pwsh were not in isScriptingCommand
  // and would be falsely flagged as ELF blockers on cross-family translation
  it('should not flag bash as ELF blocker on Linux→Win', () => {
    const result = translateCommand(['bash', 'script.sh'], 'linux', 'win32');
    expect(result.blockers).toHaveLength(0);
  });

  it('should not flag zsh as ELF blocker on Linux→Win', () => {
    const result = translateCommand(['zsh', 'script.zsh'], 'linux', 'win32');
    expect(result.blockers).toHaveLength(0);
  });

  it('should not flag fish as ELF blocker on Linux→Win', () => {
    const result = translateCommand(['fish', 'script.fish'], 'linux', 'win32');
    expect(result.blockers).toHaveLength(0);
  });

  it('should not flag powershell as ELF blocker on Linux→Win', () => {
    const result = translateCommand(['powershell', '-c', 'ls'], 'linux', 'win32');
    expect(result.blockers).toHaveLength(0);
  });

  it('should not flag pwsh as ELF blocker on Linux→Win', () => {
    const result = translateCommand(['pwsh', '-c', 'ls'], 'linux', 'win32');
    expect(result.blockers).toHaveLength(0);
  });

  // Known-paths ordering: specific before generic (/users/public before /users/)
  it('Win→Unix: /users/public should match before generic /users/ fallback', () => {
    const publicResult = translateCommand(['cat', 'C:\\Users\\Public\\doc.txt'], 'win32', 'linux');
    expect(publicResult.command[1]).toMatch(/^\/var\/public\/doc\.txt$/i);

    const userResult = translateCommand(['cat', 'C:\\Users\\alice\\doc.txt'], 'win32', 'linux');
    expect(userResult.command[1]).toMatch(/^\/home\/alice\/doc\.txt$/i);
  });

  // Regression: unmapped Linux paths should NOT get C: prefix blindly added
  it('Linux→Win: unmapped paths should not get C: prefix', () => {
    const result = translateCommand(['ls', '/data/projects/my_app'], 'linux', 'win32');
    const p = result.command[1];
    expect(p).not.toMatch(/^C:/);
    expect(p).toContain('data');
    expect(p).toContain('projects');
    expect(p).toContain('my_app');
  });

  it('Linux→Win: known paths still get proper Windows translation', () => {
    const result = translateCommand(['node', '/home/user/app.js'], 'linux', 'win32');
    const p = result.command[1];
    expect(p).toMatch(/^C:\\Users\\/);
  });

  it('Linux→Win: relative paths should not get C: prefix', () => {
    const result = translateCommand(['node', './src/app.js'], 'linux', 'win32');
    const p = result.command[1];
    expect(p).not.toMatch(/^C:/);
    expect(p).toBe('.\\src\\app.js');
  });
});
