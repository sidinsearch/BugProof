import { diffArtifacts, DiffResult } from '../../src/diff/engine';
import { ArtifactManifest } from '../../src/types/artifact';
import { FailureRecord } from '../../src/types/failure';

function makeManifest(overrides: Partial<ArtifactManifest> = {}): ArtifactManifest {
  return {
    version: '1.0',
    bugproof_version: '0.1.0',
    name: 'test-bug',
    description: 'Test bug',
    captured_at: '2026-05-04T00:00:00Z',
    captured_on: { os: 'linux', arch: 'x64', node_version: 'v24.0.0' },
    command: ['npm', 'test'],
    working_directory: '/tmp/test',
    exit_code: 1,
    duration_ms: 250,
    files_count: 3,
    files_size_bytes: 1024,
    secrets_detected: false,
    secrets_skipped: [],
    ...overrides,
  };
}

function makeFailure(overrides: Partial<FailureRecord> = {}): FailureRecord {
  return {
    exit_code: 1,
    signal: null,
    stdout_lines: 10,
    stderr_lines: 5,
    stderr_snippet: 'Error: test failed',
    fingerprint: 'sha256:abc123',
    error_patterns: ['Error'],
    duration_ms: 250,
    timeout: false,
    ...overrides,
  };
}

describe('Diff Engine', () => {
  it('should detect identical artifacts', () => {
    const result = diffArtifacts(
      { manifest: makeManifest(), failure: makeFailure(), files: [] },
      { manifest: makeManifest(), failure: makeFailure(), files: [] },
    );

    expect(result.identical).toBe(true);
    expect(result.changes).toHaveLength(0);
  });

  it('should detect exit code changes', () => {
    const result = diffArtifacts(
      { manifest: makeManifest({ exit_code: 1 }), failure: makeFailure({ exit_code: 1 }), files: [] },
      { manifest: makeManifest({ exit_code: 0 }), failure: makeFailure({ exit_code: 0 }), files: [] },
    );

    expect(result.identical).toBe(false);
    const exitChange = result.changes.find(c => c.field === 'exit_code');
    expect(exitChange).toBeDefined();
    expect(exitChange!.left).toBe(1);
    expect(exitChange!.right).toBe(0);
  });

  it('should detect fingerprint differences', () => {
    const result = diffArtifacts(
      { manifest: makeManifest(), failure: makeFailure({ fingerprint: 'sha256:aaa' }), files: [] },
      { manifest: makeManifest(), failure: makeFailure({ fingerprint: 'sha256:bbb' }), files: [] },
    );

    expect(result.identical).toBe(false);
    const fpChange = result.changes.find(c => c.field === 'fingerprint');
    expect(fpChange).toBeDefined();
  });

  it('should detect command differences', () => {
    const result = diffArtifacts(
      { manifest: makeManifest({ command: ['npm', 'test'] }), failure: makeFailure(), files: [] },
      { manifest: makeManifest({ command: ['npm', 'run', 'test'] }), failure: makeFailure(), files: [] },
    );

    expect(result.identical).toBe(false);
    const cmdChange = result.changes.find(c => c.field === 'command');
    expect(cmdChange).toBeDefined();
  });

  it('should detect platform differences', () => {
    const result = diffArtifacts(
      {
        manifest: makeManifest({ captured_on: { os: 'linux', arch: 'x64', node_version: 'v24.0.0' } }),
        failure: makeFailure(),
        files: [],
      },
      {
        manifest: makeManifest({ captured_on: { os: 'win32', arch: 'x64', node_version: 'v24.0.0' } }),
        failure: makeFailure(),
        files: [],
      },
    );

    expect(result.identical).toBe(false);
    const osChange = result.changes.find(c => c.field === 'os');
    expect(osChange).toBeDefined();
    expect(osChange!.left).toBe('linux');
    expect(osChange!.right).toBe('win32');
  });

  it('should detect file list differences', () => {
    const filesA = [
      { path: 'src/a.ts', size: 100, sha256: 'aaa' },
      { path: 'src/b.ts', size: 200, sha256: 'bbb' },
    ];
    const filesB = [
      { path: 'src/a.ts', size: 100, sha256: 'aaa' },
      { path: 'src/c.ts', size: 300, sha256: 'ccc' },
    ];

    const result = diffArtifacts(
      { manifest: makeManifest(), failure: makeFailure(), files: filesA },
      { manifest: makeManifest(), failure: makeFailure(), files: filesB },
    );

    expect(result.identical).toBe(false);
    expect(result.fileChanges).toBeDefined();
    expect(result.fileChanges!.added).toContain('src/c.ts');
    expect(result.fileChanges!.removed).toContain('src/b.ts');
    expect(result.fileChanges!.modified).toHaveLength(0);
  });

  it('should detect files modified by content hash change', () => {
    const filesA = [{ path: 'src/a.ts', size: 100, sha256: 'hash1' }];
    const filesB = [{ path: 'src/a.ts', size: 120, sha256: 'hash2' }];

    const result = diffArtifacts(
      { manifest: makeManifest(), failure: makeFailure(), files: filesA },
      { manifest: makeManifest(), failure: makeFailure(), files: filesB },
    );

    expect(result.fileChanges!.modified).toContain('src/a.ts');
  });

  it('should detect error pattern differences', () => {
    const result = diffArtifacts(
      { manifest: makeManifest(), failure: makeFailure({ error_patterns: ['TypeError'] }), files: [] },
      { manifest: makeManifest(), failure: makeFailure({ error_patterns: ['RangeError'] }), files: [] },
    );

    expect(result.identical).toBe(false);
    const patternChange = result.changes.find(c => c.field === 'error_patterns');
    expect(patternChange).toBeDefined();
  });
});
