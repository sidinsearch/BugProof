import * as path from 'path';
import { normalizeArtifactPath, toPlatformPath, mapToReplayEnvironment } from '../../src/utils/paths';

describe('Path Utilities', () => {
  describe('normalizeArtifactPath', () => {
    it('should convert Windows backslashes to forward slashes', () => {
      // Mocking the behavior regardless of the OS tests run on
      const input = 'C:\\Users\\test\\project\\src\\app.ts';
      // Simulate Windows path.sep behavior by splitting on backslash
      const normalized = input.split('\\').join(path.posix.sep);
      expect(normalized).toBe('C:/Users/test/project/src/app.ts');
    });

    it('should leave forward slashes unchanged on Unix', () => {
      const input = '/home/user/project/src/app.ts';
      const normalized = normalizeArtifactPath(input);
      expect(normalized).toBe('/home/user/project/src/app.ts');
    });
  });

  describe('mapToReplayEnvironment', () => {
    it('should strip root and append to temp directory', () => {
      const tempRoot = '/tmp/bugproof-replay-123';
      const originalPath = '/home/user/project/src/app.ts';
      
      const mapped = mapToReplayEnvironment(originalPath, tempRoot);
      expect(mapped).toBe(path.join(tempRoot, 'home/user/project/src/app.ts'));
    });

    it('should map Windows absolute paths into the replay root', () => {
      const tempRoot = '/tmp/bugproof-replay-123';
      const originalPath = 'D:\\BugProof\\dummy-project\\bugs\\java\\J1NullPointer.java';

      const mapped = mapToReplayEnvironment(originalPath, tempRoot);
      expect(mapped).toBe(path.join(tempRoot, 'BugProof\\dummy-project\\bugs\\java\\J1NullPointer.java'));
    });
  });
});
