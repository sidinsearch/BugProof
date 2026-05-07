import { generateHints } from '../../src/replay/hints.js';
import { FailureRecord } from '../../src/types/failure.js';

function makeFailure(overrides: Partial<FailureRecord> = {}): FailureRecord {
  return {
    exit_code: 1,
    signal: null,
    stdout_lines: 0,
    stderr_lines: 1,
    stderr_snippet: 'Error',
    fingerprint: 'sha256:abc',
    error_patterns: ['Error'],
    duration_ms: 100,
    timeout: false,
    ...overrides,
  };
}

describe('Smart Hints Engine', () => {
  it('should detect missing Node.js module', () => {
    const expected = makeFailure();
    const actual = makeFailure({ exit_code: 1 });
    const stderr = "Error: Cannot find module 'express'\nRequire stack:\n- /app/index.js";

    const hints = generateHints(expected, actual, stderr);
    expect(hints.length).toBeGreaterThanOrEqual(1);
    const depHint = hints.find(h => h.category === 'missing_dependency');
    expect(depHint).toBeDefined();
    expect(depHint!.suggestion).toContain('npm install express');
  });

  it('should detect missing Python module', () => {
    const expected = makeFailure();
    const actual = makeFailure();
    const stderr = "Traceback:\n  File \"app.py\", line 1\nModuleNotFoundError: No module named 'redis'";

    const hints = generateHints(expected, actual, stderr);
    const depHint = hints.find(h => h.category === 'missing_dependency');
    expect(depHint).toBeDefined();
    expect(depHint!.suggestion).toContain('pip install redis');
  });

  it('should detect permission errors', () => {
    const expected = makeFailure();
    const actual = makeFailure();
    const stderr = 'Error: EACCES: permission denied, open /etc/secret';

    const hints = generateHints(expected, actual, stderr);
    const permHint = hints.find(h => h.category === 'permission');
    expect(permHint).toBeDefined();
  });

  it('should detect network issues', () => {
    const expected = makeFailure();
    const actual = makeFailure();
    const stderr = 'Error: connect ECONNREFUSED 127.0.0.1:5432';

    const hints = generateHints(expected, actual, stderr);
    const netHint = hints.find(h => h.category === 'network');
    expect(netHint).toBeDefined();
    expect(netHint!.suggestion).toContain('network');
  });

  it('should detect file not found errors', () => {
    const expected = makeFailure();
    const actual = makeFailure();
    const stderr = "Error: ENOENT: no such file or directory, open '/app/config.json'\n    at Object.openSync (node:fs:600:3)";

    const hints = generateHints(expected, actual, stderr);
    const fileHint = hints.find(h => h.category === 'file_not_found');
    expect(fileHint).toBeDefined();
    expect(fileHint!.suggestion).toContain('config.json');
  });

  it('should report bug appears fixed when command succeeds', () => {
    const expected = makeFailure({ exit_code: 1 });
    const actual = makeFailure({ exit_code: 0 });
    const stderr = '';

    const hints = generateHints(expected, actual, stderr);
    expect(hints.length).toBe(1);
    expect(hints[0].title).toContain('fixed');
  });

  it('should give general hint for unknown error mismatch', () => {
    const expected = makeFailure({ exit_code: 1 });
    const actual = makeFailure({ exit_code: 2 });
    const stderr = 'Something unknown went wrong';

    const hints = generateHints(expected, actual, stderr);
    expect(hints.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect authentication failures', () => {
    const expected = makeFailure();
    const actual = makeFailure();
    const stderr = 'HTTP Error: 401 Unauthorized - Invalid API token';

    const hints = generateHints(expected, actual, stderr);
    const authHint = hints.find(h => h.category === 'env_missing');
    expect(authHint).toBeDefined();
    expect(authHint!.suggestion).toContain('API keys');
  });
});
