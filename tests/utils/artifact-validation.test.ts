import {
  secureJsonParse,
  validateArtifactManifest,
  validateFailureRecord,
  validateRunConfig,
} from '../../src/utils/artifact-validation';

describe('artifact validation', () => {
  const validManifest = {
    version: '1.0',
    bugproof_version: '0.2.2',
    name: 'bug_1',
    description: 'desc',
    captured_at: '2026-01-01T00:00:00.000Z',
    captured_on: {
      os: 'win32',
      arch: 'x64',
      node_version: 'v20.0.0',
      git_commit: 'abc123',
      git_branch: 'main',
      git_dirty: false,
    },
    command: ['node', 'fail.js'],
    working_directory: 'D:/repo',
    exit_code: 1,
    duration_ms: 10,
    files_count: 3,
    files_size_bytes: 1024,
    secrets_detected: false,
    secrets_skipped: [],
  };

  const validRun = {
    command: ['node', 'fail.js'],
    working_directory: 'D:/repo',
    environment: {
      FOO: 'bar',
    },
    timeout_ms: 300000,
    capture_output: true,
  };

  const validFailure = {
    exit_code: 1,
    signal: null,
    stdout_lines: 0,
    stderr_lines: 1,
    stderr_snippet: 'boom',
    fingerprint: 'abc',
    error_patterns: ['TypeError'],
    duration_ms: 10,
    timeout: false,
  };

  it('accepts valid artifact metadata', () => {
    expect(validateArtifactManifest(validManifest)).toMatchObject(validManifest);
    expect(validateRunConfig(validRun)).toMatchObject(validRun);
    expect(validateFailureRecord(validFailure)).toMatchObject(validFailure);
  });

  it('rejects unknown fields in manifest', () => {
    const withUnknown = {
      ...validManifest,
      unexpected: true,
    };

    expect(() => validateArtifactManifest(withUnknown as unknown)).toThrow('unknown field');
  });

  it('rejects invalid command type in run config', () => {
    const invalidRun = {
      ...validRun,
      command: { bad: true },
    };

    expect(() => validateRunConfig(invalidRun as unknown)).toThrow('run.command must be an array');
  });

  it('rejects prototype pollution keys during JSON parse', () => {
    const payload = '{"ok":true,"__proto__":{"polluted":true}}';
    expect(() => secureJsonParse(payload, 'manifest.json')).toThrow('disallowed key');
  });

  it('rejects overly deep JSON payloads', () => {
    let nested = '1';
    for (let i = 0; i < 40; i += 1) {
      nested = `{"a":${nested}}`;
    }
    expect(() => secureJsonParse(nested, 'run.json')).toThrow('nesting depth');
  });
});
