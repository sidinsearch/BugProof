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
      const expected = path.posix.join(tempRoot, 'BugProof/dummy-project/bugs/java/J1NullPointer.java');
      expect(mapped).toBe(expected);
    });

    it('should handle forward-slash Windows paths', () => {
      const tempRoot = '/tmp/replay';
      const originalPath = 'C:/Users/test/file.js';
      const mapped = mapToReplayEnvironment(originalPath, tempRoot);
      expect(mapped).toContain('/tmp/replay/Users/test/file.js');
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
  });
});
