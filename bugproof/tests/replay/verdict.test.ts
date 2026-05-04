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

  it('should confirm fuzzy pattern match if fingerprint differs', () => {
    const actualFailure = { ...baseFailure, fingerprint: 'sha256:diff5678' };
    
    const verdict = generateVerdict({
      expectedFailure: baseFailure,
      actualFailure,
      actualStdout: '',
      actualStderr: '',
      replayDirectory: process.cwd(),
    });
    
    expect(verdict.status).toBe('confirmed');
    expect(verdict.message).toContain('fuzzy match');
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
});
