import { generateVerdict } from '../../src/replay/verdict';
import { FailureRecord } from '../../src/types/failure';

describe('Verdict Generator', () => {
  const baseFailure: FailureRecord = {
    exit_code: 1,
    signal: null,
    stdout_lines: 10,
    stderr_lines: 5,
    stderr_snippet: 'Error!',
    fingerprint: 'sha256:abcd1234',
    error_patterns: ['TypeError', 'fatal: error'],
    duration_ms: 100,
    timeout: false
  };

  it('should confirm exact fingerprint match', () => {
    const verdict = generateVerdict({
      expectedFailure: baseFailure,
      actualFailure: baseFailure, // Exact same
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });
    
    expect(verdict.status).toBe('confirmed');
    expect(verdict.message).toContain('exact fingerprint match');
  });

  it('should confirm normalized pattern match when order differs', () => {
    const expectedFailure = {
      ...baseFailure,
      error_patterns: ['TypeError', 'ERR_MODULE_NOT_FOUND'],
    };
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:diff5678',
      error_patterns: ['ERR_MODULE_NOT_FOUND', 'TypeError', 'TypeError', 'something went wrong while parsing'],
    };
    
    const verdict = generateVerdict({
      expectedFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });
    
    expect(verdict.status).toBe('confirmed');
    expect(verdict.message).toContain('normalized pattern match');
  });

  it('should confirm when the same root cause has an extra incidental pattern token', () => {
    const expectedFailure = {
      ...baseFailure,
      error_patterns: ['TypeError'],
    };
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:extra-token',
      error_patterns: ['TypeError', 'ERR_SOMETHING_ELSE'],
    };

    const verdict = generateVerdict({
      expectedFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });

    expect(verdict.status).toBe('confirmed');
    expect(verdict.message).toContain('normalized pattern match');
  });

  it('should not confirm when an extra exception token is present', () => {
    const expectedFailure = {
      ...baseFailure,
      error_patterns: ['TypeError'],
    };
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:code-token',
      error_patterns: ['TypeError', 'RangeError'],
    };

    const verdict = generateVerdict({
      expectedFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });

    expect(verdict.status).toBe('not_confirmed');
    expect(verdict.message).toContain('different error');
  });

  it('should confirm when only freeform error text matches', () => {
    const expectedFailure = {
      ...baseFailure,
      error_patterns: ['fatal: cannot open file'],
    };
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:freeform-match',
      error_patterns: ['fatal: cannot open file'],
    };

    const verdict = generateVerdict({
      expectedFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });

    expect(verdict.status).toBe('confirmed');
    expect(verdict.message).toContain('normalized pattern match');
  });

  it('should confirm freeform matches regardless of case', () => {
    const expectedFailure = {
      ...baseFailure,
      error_patterns: ['Error Message'],
    };
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:case-match',
      error_patterns: ['error message'],
    };

    const verdict = generateVerdict({
      expectedFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });

    expect(verdict.status).toBe('confirmed');
    expect(verdict.message).toContain('normalized pattern match');
  });

  it('should not confirm when error patterns are empty', () => {
    const expectedFailure = {
      ...baseFailure,
      error_patterns: [],
    };
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:empty-patterns',
      error_patterns: [],
    };

    const verdict = generateVerdict({
      expectedFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });

    expect(verdict.status).toBe('not_confirmed');
    expect(verdict.message).toContain('different error');
  });

  it('should not confirm when an unexpected exception token is present', () => {
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:partial-overlap',
      error_patterns: ['TypeError', 'RangeError'],
    };

    const verdict = generateVerdict({
      expectedFailure: baseFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });

    expect(verdict.status).toBe('not_confirmed');
    expect(verdict.message).toContain('different error');
  });

  it('should not confirm if exit code is 0 (success)', () => {
    const actualFailure = { ...baseFailure, exit_code: 0, fingerprint: 'sha256:success', error_patterns: [] };
    
    const verdict = generateVerdict({
      expectedFailure: baseFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });
    
    expect(verdict.status).toBe('not_confirmed');
    expect(verdict.message).toContain('succeeded on replay');
  });

  it('should confirm cross-platform match: Linux paths vs Windows paths', () => {
    const expectedFailure = {
      ...baseFailure,
      fingerprint: 'sha256:linux-capture',
      error_patterns: [
        "Error: Cannot find module '/home/user/project/src/index.js'",
        'MODULE_NOT_FOUND',
      ],
    };
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:windows-replay',
      error_patterns: [
        "Error: Cannot find module 'C:\\Users\\user\\project\\src\\index.js'",
        'MODULE_NOT_FOUND',
      ],
    };

    const verdict = generateVerdict({
      expectedFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });

    expect(verdict.status).toBe('confirmed');
  });

  it('should confirm cross-platform match: Windows paths vs Linux paths', () => {
    const expectedFailure = {
      ...baseFailure,
      fingerprint: 'sha256:windows-capture',
      error_patterns: [
        "Error: ENOENT: no such file, open 'C:\\Users\\user\\project\\config.json'",
      ],
    };
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:linux-replay',
      error_patterns: [
        "Error: ENOENT: no such file, open '/home/user/project/config.json'",
      ],
    };

    const verdict = generateVerdict({
      expectedFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });

    expect(verdict.status).toBe('confirmed');
  });

  it('should normalize line endings in cross-platform comparison', () => {
    const expectedFailure = {
      ...baseFailure,
      fingerprint: 'sha256:unix-eol',
      error_patterns: [
        "Error at line 10\n  at module.js:42",
      ],
    };
    const actualFailure = {
      ...baseFailure,
      fingerprint: 'sha256:windows-eol',
      error_patterns: [
        "Error at line 10\r\n  at module.js:42",
      ],
    };

    const verdict = generateVerdict({
      expectedFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });

    expect(verdict.status).toBe('confirmed');
  });
});
