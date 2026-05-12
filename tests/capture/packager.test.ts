import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { packageArtifact } from '../../src/capture/packager.js';
import { ArtifactManifest, RunConfig, ArtifactMetadata, EnvSchema } from '../../src/types/artifact.js';
import { FailureRecord } from '../../src/types/failure.js';
import { extractZip } from '../../src/utils/archive.js';
import { generateKeyPair } from '../../src/utils/signing.js';

jest.setTimeout(30000);

function gitInit(dir: string) {
  spawnSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, encoding: 'utf-8' });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir, encoding: 'utf-8' });
}

function gitAddCommit(dir: string, msg: string) {
  spawnSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf-8' });
  spawnSync('git', ['commit', '-m', msg], { cwd: dir, encoding: 'utf-8' });
}

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

    const extractDir = path.join(tempDir, 'extracted-secrets');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const parsedRun = JSON.parse(
      fs.readFileSync(path.join(extractDir, 'run.json'), 'utf-8'),
    );
    expect(parsedRun.environment.MY_API_KEY).toBe('<REDACTED>');
    expect(parsedRun.environment.SAFE_VAR).toBe('hello');
  });

  it('should include git-tracked files in artifact', async () => {
    const gitDir = path.join(tempDir, 'git-tracked');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'index.js'), 'module.exports = 1;');
    fs.writeFileSync(path.join(gitDir, 'lib.js'), 'export const x = 1;');
    gitAddCommit(gitDir, 'init');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'tracked.bug');

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
    });

    expect(result.filesCount).toBe(2);
    expect(result.totalSize).toBeGreaterThan(0);

    const extractDir = path.join(tempDir, 'extracted-tracked');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const files = fs.readdirSync(path.join(extractDir, 'files'));
    expect(files).toContain('index.js');
    expect(files).toContain('lib.js');

    const filesJson = JSON.parse(
      fs.readFileSync(path.join(extractDir, 'files.json'), 'utf-8'),
    );
    expect(filesJson).toHaveLength(2);
    expect(filesJson[0].sha256).toBeTruthy();
  });

  it('should include untracked files when includeUntracked is true', async () => {
    const gitDir = path.join(tempDir, 'git-untracked');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'tracked.js'), 'module.exports = 1;');
    gitAddCommit(gitDir, 'init');
    fs.writeFileSync(path.join(gitDir, 'untracked.js'), 'module.exports = 2;');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'untracked.bug');

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
      includeUntracked: true,
    });

    expect(result.filesCount).toBe(2);

    const extractDir = path.join(tempDir, 'extracted-untracked');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const files = fs.readdirSync(path.join(extractDir, 'files'));
    expect(files).toContain('tracked.js');
    expect(files).toContain('untracked.js');
  });

  it('should apply exclude patterns correctly', async () => {
    const gitDir = path.join(tempDir, 'git-exclude');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'app.js'), 'module.exports = 1;');
    fs.mkdirSync(path.join(gitDir, 'node_modules'));
    fs.writeFileSync(path.join(gitDir, 'node_modules', 'dep.js'), 'module.exports = 2;');
    gitAddCommit(gitDir, 'init');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'exclude.bug');

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
      excludePatterns: ['node_modules/**'],
    });

    expect(result.filesCount).toBe(1);

    const extractDir = path.join(tempDir, 'extracted-exclude');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const files = fs.readdirSync(path.join(extractDir, 'files'));
    expect(files).toContain('app.js');
    expect(files).not.toContain('node_modules');
  });

  it('should write source strategy metadata when provided', async () => {
    const gitDir = path.join(tempDir, 'git-strategy');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'app.js'), 'module.exports = 1;');
    gitAddCommit(gitDir, 'init');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'strategy.bug');

    const sourceStrategy = {
      strategy: 'git-full' as const,
      commit: 'abc123',
      reason: 'full clone',
      filesToInclude: ['app.js'],
      totalSize: 1,
      shouldAbort: false,
      patch: 'diff --git a/app.js b/app.js\nindex abc..def 100644\n--- a/app.js\n+++ b/app.js\n@@ -1 +1 @@\n-module.exports = 1;\n+module.exports = 2;',
    };

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
      sourceStrategy,
    });

    expect(result.filesCount).toBe(1);

    const extractDir = path.join(tempDir, 'extracted-strategy');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const strategyMeta = JSON.parse(
      fs.readFileSync(path.join(extractDir, 'source-strategy.json'), 'utf-8'),
    );
    expect(strategyMeta.strategy).toBe('git-full');
    expect(strategyMeta.commit).toBe('abc123');

    expect(fs.existsSync(path.join(extractDir, 'changes.patch'))).toBe(true);
  });

  it('should write env snapshot when provided', async () => {
    const gitDir = path.join(tempDir, 'git-env-snap');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'app.js'), 'module.exports = 1;');
    gitAddCommit(gitDir, 'init');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'envsnap.bug');

    const envSnapshot = {
      node: null,
      python: null,
      ruby: null,
      go: null,
      rust: null,
      java: null,
      os: { platform: os.platform(), release: os.release(), arch: os.arch() },
      npm: null,
      pip: null,
    };

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
      envSnapshot,
    });

    const extractDir = path.join(tempDir, 'extracted-envsnap');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const parsed = JSON.parse(
      fs.readFileSync(path.join(extractDir, 'env-snapshot.json'), 'utf-8'),
    );
    expect(parsed.os.platform).toBe(os.platform());
  });

  it('should write language context when provided', async () => {
    const gitDir = path.join(tempDir, 'git-lang');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'app.js'), 'module.exports = 1;');
    gitAddCommit(gitDir, 'init');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'lang.bug');

    const languageContext = {
      languages: [{
        id: 'node', name: 'Node.js', version: '18',
        buildSystem: null, packageManager: 'npm', lockfile: 'package-lock.json',
        needsBuild: false, crossPlatform: 'high' as const, notes: [],
        confidence: 0.95,
      }],
      primary: {
        id: 'node', name: 'Node.js', version: '18',
        buildSystem: null, packageManager: 'npm', lockfile: 'package-lock.json',
        needsBuild: false, crossPlatform: 'high' as const, notes: [],
        confidence: 0.95,
      },
      buildCommands: [],
      criticalFiles: [],
      warnings: [],
    };

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
      languageContext,
    });

    const extractDir = path.join(tempDir, 'extracted-lang');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const parsed = JSON.parse(
      fs.readFileSync(path.join(extractDir, 'language-context.json'), 'utf-8'),
    );
    expect(parsed.languages[0].id).toBe('node');
  });

  it('should produce a signed artifact when signingKey is provided', async () => {
    const gitDir = path.join(tempDir, 'git-signed');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'app.js'), 'module.exports = 1;');
    gitAddCommit(gitDir, 'init');

    const keyPair = generateKeyPair();
    const signer = 'test-user';

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'signed.bug');

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
      signingKey: keyPair,
      signer,
    });

    expect(result.filesCount).toBe(1);

    const extractDir = path.join(tempDir, 'extracted-signed');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const sigFile = path.join(extractDir, 'signature.json');
    expect(fs.existsSync(sigFile)).toBe(true);

    const signature = JSON.parse(fs.readFileSync(sigFile, 'utf-8'));
    expect(signature.signer).toBe('test-user');
    expect(signature.signature).toBeTruthy();
  });

  it('should return empty files when git fails', async () => {
    const noGitDir = path.join(tempDir, 'no-git-empty');
    fs.mkdirSync(noGitDir, { recursive: true });
    // Do not init git, but we want try includeUntracked
    // which will hit the git-ls-files fallback path

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(noGitDir);
    const artifactPath = path.join(tempDir, 'nogit.bug');

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: noGitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
      includeUntracked: true,
    });

    expect(result.filesCount).toBe(0);
  });

  it('should include manifest with file stats', async () => {
    const gitDir = path.join(tempDir, 'git-stats');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'a.js'), 'a');
    fs.writeFileSync(path.join(gitDir, 'b.js'), 'bb');
    gitAddCommit(gitDir, 'init');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'stats.bug');

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
    });

    expect(result.filesCount).toBe(2);
    expect(result.totalSize).toBe(3);
    expect(result.fileEntries).toHaveLength(2);
    expect(result.fileEntries[0].size).toBe(1);
    expect(result.fileEntries[1].size).toBe(2);
  });

  it('should write failure fingerprint data', async () => {
    const gitDir = path.join(tempDir, 'git-fingerprint');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'app.js'), 'module.exports = 1;');
    gitAddCommit(gitDir, 'init');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'fp.bug');

    await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure: { ...failure, fingerprint: 'sha256:xyz789', error_patterns: ['TypeError', 'ReferenceError'] },
      stdout: 'output',
      stderr: 'error output',
      secretKeys: [],
    });

    const extractDir = path.join(tempDir, 'extracted-fp');
    fs.mkdirSync(extractDir);
    await extractZip(artifactPath, extractDir);

    const fp = JSON.parse(
      fs.readFileSync(path.join(extractDir, 'logs', 'fingerprint.json'), 'utf-8'),
    );
    expect(fp.fingerprint).toBe('sha256:xyz789');
    expect(fp.error_patterns).toContain('TypeError');

    const stdout = fs.readFileSync(path.join(extractDir, 'logs', 'stdout.txt'), 'utf-8');
    expect(stdout).toBe('output');
  });

  it('should compute SHA-256 checksums for files', async () => {
    const gitDir = path.join(tempDir, 'git-checksum');
    fs.mkdirSync(gitDir, { recursive: true });
    gitInit(gitDir);
    fs.writeFileSync(path.join(gitDir, 'data.txt'), 'hello world');
    gitAddCommit(gitDir, 'init');

    const { manifest, runConfig, failure, metadata, envSchema } = makeDefaults(gitDir);
    const artifactPath = path.join(tempDir, 'checksum.bug');

    const result = await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig: { ...runConfig, working_directory: gitDir },
      metadata,
      failure,
      stdout: '',
      stderr: 'Error',
      secretKeys: [],
    });

    expect(result.fileEntries[0].sha256).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });
});
