import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { packageArtifact } from '../../src/capture/packager.js';
import { ArtifactManifest, RunConfig, ArtifactMetadata, EnvSchema } from '../../src/types/artifact.js';
import { FailureRecord } from '../../src/types/failure.js';
import { extractZip } from '../../src/utils/archive.js';

jest.setTimeout(15000);

describe('Packager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-packager-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeDefaults(workingDir: string) {
    const manifest: ArtifactManifest = {
      version: '1.0',
      bugproof_version: '0.1.2',
      name: 'test-artifact',
      description: 'test',
      captured_at: new Date().toISOString(),
      captured_on: {
        os: os.platform(),
        arch: os.arch(),
        node_version: process.version,
        git_commit: undefined,
        git_branch: undefined,
        git_dirty: false,
      },
      command: ['node', '-e', 'process.exit(1)'],
      working_directory: workingDir,
      exit_code: 1,
      duration_ms: 10,
      files_count: 0,
      files_size_bytes: 0,
      secrets_detected: false,
      secrets_skipped: [],
    };

    const runConfig: RunConfig = {
      command: ['node', '-e', 'process.exit(1)'],
      working_directory: workingDir,
      environment: { PATH: '/usr/bin' },
      timeout_ms: 5000,
      capture_output: true,
    };

    const failure: FailureRecord = {
      exit_code: 1,
      signal: null,
      stdout_lines: 0,
      stderr_lines: 1,
      stderr_snippet: 'Error',
      fingerprint: 'sha256:abc123',
      error_patterns: ['Error'],
      duration_ms: 10,
      timeout: false,
    };

    const metadata: ArtifactMetadata = {
      capture_tool_version: '0.1.2',
      captured_at: new Date().toISOString(),
      captured_by: 'test',
      captured_platform: {
        os: os.platform(),
        os_version: os.release(),
        arch: os.arch(),
        cpu_count: 1,
        memory_gb: 1,
      },
      project_context: {},
    };

    const envSchema: EnvSchema = {
      required: [],
      optional: [],
      secrets: [],
      captured_env_keys: [],
    };

    return { manifest, runConfig, failure, metadata, envSchema };
  }

  it('should produce a valid .bug artifact in a non-git directory', async () => {
    // Create a directory with no .git
    const noGitDir = path.join(tempDir, 'no-git-project');
    fs.mkdirSync(noGitDir, { recursive: true });
    fs.writeFileSync(path.join(noGitDir, 'app.js'), 'console.log("hello");');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(noGitDir);
    const artifactPath = path.join(tempDir, 'output.bug');

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: noGitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
    });

    expect(result.filesCount).toBe(0);
    expect(result.totalSize).toBe(0);
    expect(fs.existsSync(artifactPath)).toBe(true);

    // Verify the artifact can be extracted and contains valid JSON
    const extractDir = path.join(tempDir, 'extracted');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const parsedManifest = JSON.parse(
      fs.readFileSync(path.join(extractDir, 'manifest.json'), 'utf-8'),
    );
    expect(parsedManifest.name).toBe('test-artifact');
    expect(parsedManifest.files_count).toBe(0);
  });

  it('should redact secret environment variables', async () => {
    // Use a git-initialized temp directory
    const gitDir = path.join(tempDir, 'git-project');
    fs.mkdirSync(gitDir, { recursive: true });

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'secrets.bug');

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: {
        ...runConfig,
        working_directory: gitDir,
        environment: {
          PATH: '/usr/bin',
          MY_API_KEY: 'sk-secret-12345',
          SAFE_VAR: 'hello',
        },
      },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: ['MY_API_KEY'],
    });

    expect(result.filesCount).toBe(0);

    // Extract and verify redaction
    const extractDir = path.join(tempDir, 'extracted-secrets');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const parsedRun = JSON.parse(
      fs.readFileSync(path.join(extractDir, 'run.json'), 'utf-8'),
    );
    expect(parsedRun.environment.MY_API_KEY).toBe('<REDACTED>');
    expect(parsedRun.environment.SAFE_VAR).toBe('hello');
  });
});
