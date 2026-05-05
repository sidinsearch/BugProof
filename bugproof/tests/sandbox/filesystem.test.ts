import {
  createIsolatedDir,
  lockDirReadOnly,
  unlockDir,
  cleanupIsolatedDir,
  IsolatedDirResult,
} from '../../src/sandbox/filesystem';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Bug-Box Filesystem Isolation', () => {
  // Track dirs to clean up if a test fails mid-way
  const dirsToClean: string[] = [];

  afterEach(() => {
    for (const d of dirsToClean) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
    }
    dirsToClean.length = 0;
  });

  describe('createIsolatedDir', () => {
    it('should create a temporary directory that exists on disk', () => {
      const result = createIsolatedDir();
      dirsToClean.push(result.rootDir);

      expect(fs.existsSync(result.rootDir)).toBe(true);
    });

    it('should create the directory inside os.tmpdir()', () => {
      const result = createIsolatedDir();
      dirsToClean.push(result.rootDir);

      const resolved = path.resolve(result.rootDir);
      const tmpResolved = path.resolve(os.tmpdir());
      expect(resolved.startsWith(tmpResolved)).toBe(true);
    });

    it('should use the bugbox- prefix in the directory name', () => {
      const result = createIsolatedDir();
      dirsToClean.push(result.rootDir);

      expect(path.basename(result.rootDir)).toMatch(/^bugbox-/);
    });

    it('should create a workspace subdirectory', () => {
      const result = createIsolatedDir();
      dirsToClean.push(result.rootDir);

      expect(fs.existsSync(result.workspaceDir)).toBe(true);
    });

    it('should create a logs subdirectory', () => {
      const result = createIsolatedDir();
      dirsToClean.push(result.rootDir);

      expect(fs.existsSync(result.logsDir)).toBe(true);
    });

    it('should return all expected paths in the result', () => {
      const result = createIsolatedDir();
      dirsToClean.push(result.rootDir);

      expect(result).toHaveProperty('rootDir');
      expect(result).toHaveProperty('filesDir');
      expect(result).toHaveProperty('workspaceDir');
      expect(result).toHaveProperty('logsDir');

      // filesDir and workspaceDir should be children of rootDir
      expect(result.filesDir.startsWith(result.rootDir)).toBe(true);
      expect(result.workspaceDir.startsWith(result.rootDir)).toBe(true);
      expect(result.logsDir.startsWith(result.rootDir)).toBe(true);
    });

    it('should allow writing files into the workspace dir', () => {
      const result = createIsolatedDir();
      dirsToClean.push(result.rootDir);

      const testFile = path.join(result.workspaceDir, 'test.txt');
      fs.writeFileSync(testFile, 'hello');
      expect(fs.readFileSync(testFile, 'utf-8')).toBe('hello');
    });

    it('should create unique directories on successive calls', () => {
      const a = createIsolatedDir();
      const b = createIsolatedDir();
      dirsToClean.push(a.rootDir, b.rootDir);

      expect(a.rootDir).not.toBe(b.rootDir);
    });
  });

  describe('lockDirReadOnly', () => {
    it('should make a directory read-only so new files cannot be created', () => {
      const result = createIsolatedDir();
      dirsToClean.push(result.rootDir);

      // Put a file in filesDir first
      const testFile = path.join(result.filesDir, 'source.ts');
      fs.writeFileSync(testFile, 'const x = 1;');

      lockDirReadOnly(result.filesDir);

      // Existing file should still be readable
      expect(fs.readFileSync(testFile, 'utf-8')).toBe('const x = 1;');

      // On Windows, icacls read-only prevents writing to existing files
      // On Linux, chmod removes write bit
      if (os.platform() !== 'win32') {
        expect(() => {
          fs.writeFileSync(path.join(result.filesDir, 'new.txt'), 'fail');
        }).toThrow();
      }

      // Unlock for cleanup
      unlockDir(result.filesDir);
    });
  });

  describe('unlockDir', () => {
    it('should restore write permissions after lockDirReadOnly', () => {
      const result = createIsolatedDir();
      dirsToClean.push(result.rootDir);

      lockDirReadOnly(result.filesDir);
      unlockDir(result.filesDir);

      // Should be writable again
      const testFile = path.join(result.filesDir, 'after-unlock.txt');
      fs.writeFileSync(testFile, 'works');
      expect(fs.readFileSync(testFile, 'utf-8')).toBe('works');
    });
  });

  describe('cleanupIsolatedDir', () => {
    it('should remove the entire root directory', () => {
      const result = createIsolatedDir();
      // Don't push to dirsToClean since we're testing cleanup itself

      fs.writeFileSync(path.join(result.workspaceDir, 'file.txt'), 'data');

      cleanupIsolatedDir(result);
      expect(fs.existsSync(result.rootDir)).toBe(false);
    });

    it('should not throw if the directory was already removed', () => {
      const result = createIsolatedDir();
      fs.rmSync(result.rootDir, { recursive: true, force: true });

      expect(() => cleanupIsolatedDir(result)).not.toThrow();
    });

    it('should clean up even if filesDir was locked read-only', () => {
      const result = createIsolatedDir();

      fs.writeFileSync(path.join(result.filesDir, 'locked.txt'), 'data');
      lockDirReadOnly(result.filesDir);

      // cleanup should handle unlocking internally
      cleanupIsolatedDir(result);
      expect(fs.existsSync(result.rootDir)).toBe(false);
    });
  });
});
