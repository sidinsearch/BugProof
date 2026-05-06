import {
  isPathWithinBoundary,
  isValidGitRef,
  sanitizeArtifactEnvironment,
  DANGEROUS_ENV_VARS,
} from '../../src/utils/security';

describe('Security Utilities', () => {
  describe('isPathWithinBoundary', () => {
    it('should allow paths within the boundary', () => {
      expect(isPathWithinBoundary('/tmp/artifact/files/src/a.ts', '/tmp/artifact/files')).toBe(true);
    });

    it('should reject paths that escape the boundary via ../', () => {
      expect(isPathWithinBoundary('/tmp/artifact/files/../../etc/passwd', '/tmp/artifact/files')).toBe(false);
    });

    it('should reject paths that exactly match boundary prefix but escape via name', () => {
      // /tmp/artifact/files-evil is NOT inside /tmp/artifact/files
      expect(isPathWithinBoundary('/tmp/artifact/files-evil/x', '/tmp/artifact/files')).toBe(false);
    });

    it('should allow the boundary directory itself', () => {
      expect(isPathWithinBoundary('/tmp/artifact/files', '/tmp/artifact/files')).toBe(true);
    });
  });

  describe('isValidGitRef', () => {
    it('should accept a valid hex commit SHA', () => {
      expect(isValidGitRef('abc123def456')).toBe(true);
    });

    it('should accept a full 40-char SHA', () => {
      expect(isValidGitRef('51cc0b55b21659fe64f7996f9a3477f65c8a438a')).toBe(true);
    });

    it('should accept a valid branch name', () => {
      expect(isValidGitRef('main')).toBe(true);
      expect(isValidGitRef('feat/my-feature')).toBe(true);
      expect(isValidGitRef('release/v1.0.0')).toBe(true);
    });

    it('should reject refs starting with a dash (flag injection)', () => {
      expect(isValidGitRef('--help')).toBe(false);
      expect(isValidGitRef('-n')).toBe(false);
    });

    it('should reject empty refs', () => {
      expect(isValidGitRef('')).toBe(false);
    });

    it('should reject refs with shell metacharacters', () => {
      expect(isValidGitRef('main; rm -rf /')).toBe(false);
      expect(isValidGitRef('$(whoami)')).toBe(false);
      expect(isValidGitRef('main`id`')).toBe(false);
    });

    it('should reject excessively long refs', () => {
      expect(isValidGitRef('a'.repeat(257))).toBe(false);
    });
  });

  describe('sanitizeArtifactEnvironment', () => {
    it('should strip PATH from artifact environment', () => {
      const result = sanitizeArtifactEnvironment({
        PATH: '/usr/evil/bin',
        MY_VAR: 'safe_value',
      });
      expect(result.PATH).toBeUndefined();
      expect(result.MY_VAR).toBe('safe_value');
    });

    it('should strip all dangerous env vars', () => {
      const dangerous: Record<string, string> = {};
      for (const key of DANGEROUS_ENV_VARS) {
        dangerous[key] = 'evil';
      }
      dangerous['SAFE_VAR'] = 'ok';

      const result = sanitizeArtifactEnvironment(dangerous);
      expect(Object.keys(result)).toEqual(['SAFE_VAR']);
    });

    it('should strip LD_PRELOAD (library hijacking)', () => {
      const result = sanitizeArtifactEnvironment({
        LD_PRELOAD: '/tmp/evil.so',
        APP_DEBUG: 'true',
      });
      expect(result.LD_PRELOAD).toBeUndefined();
      expect(result.APP_DEBUG).toBe('true');
    });

    it('should strip NODE_OPTIONS (V8 flag injection)', () => {
      const result = sanitizeArtifactEnvironment({
        NODE_OPTIONS: '--inspect-brk=0.0.0.0:9229',
      });
      expect(result.NODE_OPTIONS).toBeUndefined();
    });

    it('should be case-insensitive for dangerous var names', () => {
      const result = sanitizeArtifactEnvironment({
        path: '/evil',
        Path: '/evil2',
      });
      // Both lowercase and mixed case PATH variants should be stripped
      expect(result.path).toBeUndefined();
      expect(result.Path).toBeUndefined();
    });
  });
});
