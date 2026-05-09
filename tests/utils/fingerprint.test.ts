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

    it('should strip Windows absolute paths for consistent fingerprints', () => {
      const withPath = 'Error at D:\\Projects\\app\\file.js:10';
      const withoutPath = 'Error at <PATH>/file.js:10';

      expect(generateExactFingerprint(withPath)).toBe(generateExactFingerprint(withoutPath));
    });

    it('should strip Windows absolute paths for consistent fingerprints', () => {
      const withPath = 'Error at D:\\BugProof\\file.js:10';
      const withoutPath = 'Error at <PATH>/file.js:10';

      expect(generateExactFingerprint(withPath)).toBe(generateExactFingerprint(withoutPath));
    });

    it('should handle empty stderr', () => {
      const hash = generateExactFingerprint('');
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should handle non-ASCII output', () => {
      const hash = generateExactFingerprint('caf\xE9 \u2603');
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = generateExactFingerprint('error type A');
      const hash2 = generateExactFingerprint('error type B');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash for same content', () => {
      const hash1 = generateExactFingerprint('some error message');
      const hash2 = generateExactFingerprint('some error message');
      expect(hash1).toBe(hash2);
    });

    it('should trim trailing whitespace identically', () => {
      const hash1 = generateExactFingerprint('error\n');
      const hash2 = generateExactFingerprint('error');
      expect(hash1).toBe(hash2);
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
      const stderr = 'fatal: not a git repository (or any of the parent directories): .git';

      const patterns = extractErrorPatterns(stderr);
      expect(patterns).toContain('not a git repository (or any of the parent directories): .git');
    });

    it('should extract Node.js error codes', () => {
      const stderr = 'Error: MODULE_NOT_FOUND';
      const patterns = extractErrorPatterns(stderr);
      expect(patterns).toContain('MODULE_NOT_FOUND');
    });

    it('should extract multiple error patterns', () => {
      const stderr = 'TypeError: bad\nReferenceError: worse\nModuleNotFoundError: missing';
      const patterns = extractErrorPatterns(stderr);
      expect(patterns).toContain('TypeError');
      expect(patterns).toContain('ReferenceError');
      expect(patterns).toContain('ModuleNotFoundError');
    });

    it('should handle stderr with no recognizable errors', () => {
      const patterns = extractErrorPatterns('everything is fine');
      expect(patterns).toEqual([]);
    });

    it('should handle empty stderr', () => {
      const patterns = extractErrorPatterns('');
      expect(patterns).toEqual([]);
    });

    it('should not extract noise words as error codes', () => {
      const stderr = 'PATH is not set';
      const patterns = extractErrorPatterns(stderr);
      expect(patterns).not.toContain('PATH');
    });

    it('should deduplicate repeated patterns', () => {
      const stderr = 'TypeError: first\nTypeError: second';
      const patterns = extractErrorPatterns(stderr);
      const typeErrorCount = patterns.filter(p => p === 'TypeError').length;
      expect(typeErrorCount).toBe(1);
    });
  });
});
