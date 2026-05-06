import { generateExactFingerprint, extractErrorPatterns } from '../../src/utils/fingerprint';

describe('Fingerprint Utility', () => {
  describe('generateExactFingerprint', () => {
    it('should generate consistent hashes despite line ending differences', () => {
      const outputWindows = 'Error occurred\r\nLine 2';
      const outputLinux = 'Error occurred\nLine 2';
      
      const hash1 = generateExactFingerprint(outputWindows);
      const hash2 = generateExactFingerprint(outputLinux);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });

  describe('extractErrorPatterns', () => {
    it('should extract standard Error class names', () => {
      const stderr = `
      Traceback (most recent call last):
        File "app.py", line 10, in <module>
      ModuleNotFoundError: No module named 'requests'
      `;
      
      const patterns = extractErrorPatterns(stderr);
      expect(patterns).toContain('ModuleNotFoundError');
    });

    it('should extract fatal or standard error messages', () => {
      const stderr = `fatal: not a git repository (or any of the parent directories): .git`;
      
      const patterns = extractErrorPatterns(stderr);
      expect(patterns).toContain('not a git repository (or any of the parent directories): .git');
    });
  });
});
