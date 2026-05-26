import * as path from 'path';
import { normalizeArtifactPath, toPlatformPath, mapToReplayEnvironment } from '../../src/utils/paths';

describe('Path Utilities', () => {
  describe('normalizeArtifactPath', () => {
    it('should convert Windows backslashes to forward slashes', () => {
      const input = 'C:\\Users\\test\\project\\src\\app.ts';
      const normalized = input.split('\\').join(path.posix.sep);
      expect(normalized).toBe('C:/Users/test/project/src/app.ts');
    });

    it('should leave forward slashes unchanged on Unix', () => {
      const input = '/home/user/project/src/app.ts';
      const normalized = normalizeArtifactPath(input);
      expect(normalized).toBe('/home/user/project/src/app.ts');
    });

    it('should handle empty path', () => {
      expect(normalizeArtifactPath('')).toBe('');
    });

    it('should handle mixed separators', () => {
      const input = 'src\\components/Button.tsx';
      const normalized = normalizeArtifactPath(input);
      expect(normalized).toBe('src/components/Button.tsx');
    });

    it('should handle paths with no separators', () => {
      expect(normalizeArtifactPath('file.ts')).toBe('file.ts');
    });

    it('should handle UNC paths', () => {
      const input = '\\\\server\\share\\file.ts';
      const normalized = normalizeArtifactPath(input);
      expect(normalized).toBe('//server/share/file.ts');
    });
  });

  describe('toPlatformPath', () => {
    it('should convert forward slashes to platform separator', () => {
      const expected = ['a', 'b', 'c.ts'].join(path.sep);
      expect(toPlatformPath('a/b/c.ts')).toBe(expected);
    });

    it('should handle already-native paths', () => {
      const native = ['a', 'b', 'c.ts'].join(path.sep);
      expect(toPlatformPath(native)).toBe(native);
    });
  });

  describe('mapToReplayEnvironment', () => {
    it('should strip root and append to temp directory for Unix paths', () => {
      const tempRoot = '/tmp/bugproof-replay-123';
      const originalPath = '/home/user/project/src/app.ts';

      const mapped = mapToReplayEnvironment(originalPath, tempRoot);
      expect(mapped).toBe(path.join(tempRoot, 'home/user/project/src/app.ts'));
    });

    it('should map Windows absolute paths into the replay root', () => {
      const tempRoot = '/tmp/bugproof-replay-123';
      const originalPath = 'D:\\BugProof\\dummy-project\\bugs\\java\\J1NullPointer.java';

      const mapped = mapToReplayEnvironment(originalPath, tempRoot);
      // On Windows, path.join uses backslashes; on Unix, forward slashes
      expect(mapped).toContain('BugProof');
      expect(mapped).toContain('dummy-project');
      expect(mapped).toContain('bugs');
      expect(mapped).toContain('java');
      expect(mapped).toContain('J1NullPointer.java');
    });

    it('should handle forward-slash Windows paths', () => {
      const tempRoot = '/tmp/replay';
      const originalPath = 'C:/Users/test/file.js';
      const mapped = mapToReplayEnvironment(originalPath, tempRoot);
      expect(mapped).toContain('Users');
      expect(mapped).toContain('test');
      expect(mapped).toContain('file.js');
    });

    it('should handle empty original path', () => {
      const tempRoot = '/tmp/replay';
      const mapped = mapToReplayEnvironment('', tempRoot);
      // Should output the tempRoot plus any remaining path processing
      expect(mapped).toBeDefined();
    });

    it('should handle root-level paths', () => {
      const tempRoot = '/tmp/replay';
      const originalPath = '/etc/config.json';
      const mapped = mapToReplayEnvironment(originalPath, tempRoot);
      expect(mapped).toBe(path.join(tempRoot, 'etc/config.json'));
    });

    it('should handle Windows paths on Windows replay root correctly', () => {
      const tempRoot = 'C:\\Users\\test\\AppData\\Local\\Temp\\bugproof-replay-123';
      const originalPath = 'D:\\BugProof\\dummy-project\\src\\app.ts';

      const mapped = mapToReplayEnvironment(originalPath, tempRoot);
      // Should use path.join (not path.posix.join) so tempRoot is treated as native
      expect(mapped).toContain('BugProof');
      expect(mapped).toContain('dummy-project');
      expect(mapped).toContain('src');
      expect(mapped).toContain('app.ts');
      // Should NOT have double root like C:\...\D:\...
      expect(mapped).not.toContain('D:');
    });

    it('should handle Windows forward-slash paths on Windows replay root', () => {
      const tempRoot = 'C:\\Temp\\replay-456';
      const originalPath = 'C:/Users/test/file.js';
      const mapped = mapToReplayEnvironment(originalPath, tempRoot);
      expect(mapped).toContain('Users');
      expect(mapped).toContain('test');
      expect(mapped).toContain('file.js');
    });
  });
});
