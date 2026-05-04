import { formatCaptureJson, formatReplayJson, formatInspectJson } from '../../src/utils/json-output';
import { ArtifactManifest } from '../../src/types/artifact';
import { FailureRecord } from '../../src/types/failure';

const sampleManifest: ArtifactManifest = {
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
  files_count: 5,
  files_size_bytes: 1024,
  secrets_detected: false,
  secrets_skipped: [],
};

const sampleFailure: FailureRecord = {
  exit_code: 1,
  signal: null,
  stdout_lines: 10,
  stderr_lines: 5,
  stderr_snippet: 'Error: test failed',
  fingerprint: 'sha256:abc123',
  error_patterns: ['Error'],
  duration_ms: 250,
  timeout: false,
};

describe('JSON Output Formatter', () => {
  describe('formatCaptureJson', () => {
    it('should produce valid JSON with required fields', () => {
      const result = formatCaptureJson({
        manifest: sampleManifest,
        failure: sampleFailure,
        artifactPath: '/tmp/test-bug.bug',
        filesCount: 5,
        totalSize: 1024,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.artifact.name).toBe('test-bug');
      expect(parsed.artifact.path).toBe('/tmp/test-bug.bug');
      expect(parsed.failure.exit_code).toBe(1);
      expect(parsed.failure.fingerprint).toBe('sha256:abc123');
      expect(parsed.files.count).toBe(5);
      expect(parsed.files.total_size_bytes).toBe(1024);
    });

    it('should include error_patterns in output', () => {
      const result = formatCaptureJson({
        manifest: sampleManifest,
        failure: sampleFailure,
        artifactPath: '/tmp/test-bug.bug',
        filesCount: 5,
        totalSize: 1024,
      });

      const parsed = JSON.parse(result);
      expect(parsed.failure.error_patterns).toEqual(['Error']);
    });
  });

  describe('formatReplayJson', () => {
    it('should produce valid JSON with verdict', () => {
      const result = formatReplayJson({
        verdict: { status: 'confirmed', message: 'Exact match' },
        expectedExitCode: 1,
        actualExitCode: 1,
        artifactName: 'test-bug',
      });

      const parsed = JSON.parse(result);
      expect(parsed.reproduced).toBe(true);
      expect(parsed.verdict.status).toBe('confirmed');
      expect(parsed.verdict.message).toBe('Exact match');
      expect(parsed.expected_exit_code).toBe(1);
      expect(parsed.actual_exit_code).toBe(1);
    });

    it('should set reproduced=false when not confirmed', () => {
      const result = formatReplayJson({
        verdict: { status: 'not_confirmed', message: 'Different error' },
        expectedExitCode: 1,
        actualExitCode: 0,
        artifactName: 'test-bug',
      });

      const parsed = JSON.parse(result);
      expect(parsed.reproduced).toBe(false);
    });
  });

  describe('formatInspectJson', () => {
    it('should produce valid JSON with manifest and failure', () => {
      const result = formatInspectJson({
        manifest: sampleManifest,
        failure: sampleFailure,
        files: [
          { path: 'src/index.ts', size: 512, sha256: 'abc' },
          { path: 'src/app.ts', size: 512, sha256: 'def' },
        ],
      });

      const parsed = JSON.parse(result);
      expect(parsed.manifest.name).toBe('test-bug');
      expect(parsed.failure.exit_code).toBe(1);
      expect(parsed.files).toHaveLength(2);
    });
  });
});
