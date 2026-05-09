/**
 * End-to-end CLI tests: exercises capture → inspect → replay → diff
 * using a real temporary git project.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawnSync } from 'child_process';

const CLI = path.resolve(__dirname, '../../dist/cli.js');
const TIMEOUT = 30000;

function run(args: string, cwd: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('node', [CLI, ...args.split(/\s+/)], {
    cwd,
    encoding: 'utf-8',
    timeout: TIMEOUT,
    env: { ...process.env },
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
  };
}

function runJson(args: string, cwd: string): { parsed: any; status: number } {
  const result = run(`${args} --json`, cwd);
  let parsed: any;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }
  return { parsed, status: result.status };
}

describe('CLI end-to-end', () => {
  let projectDir: string;

  beforeAll(() => {
    // Create a temp git project with a failing script
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-e2e-'));
    fs.writeFileSync(
      path.join(projectDir, 'fail.js'),
      'const x = null;\nconsole.log(x.name);\n',
    );
    fs.writeFileSync(
      path.join(projectDir, 'pass.js'),
      'console.log("ok");\n',
    );
    execSync('git init', {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    execSync('git config user.name "BugProof Test"', {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    execSync('git config user.email "bugproof-test@example.com"', {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    execSync('git add .', {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    execSync('git commit -m "init"', {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  // ── version & help ──

  it('--version should output a semver string', () => {
    const r = run('--version', projectDir);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('--help should list all four commands', () => {
    const r = run('--help', projectDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('capture');
    expect(r.stdout).toContain('replay');
    expect(r.stdout).toContain('inspect');
    expect(r.stdout).toContain('diff');
  });

  // ── capture ──

  it('capture should fail when no command is provided', () => {
    const r = run('capture', projectDir);
    expect(r.status).toBe(1);
  });

  it('capture should create a .bug artifact from a failing command', () => {
    const r = run('capture --skip-secrets -n e2e-fail -- node fail.js', projectDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Artifact captured');
    expect(fs.existsSync(path.join(projectDir, 'e2e-fail.bug'))).toBe(true);
  });

  it('capture --json should produce valid JSON output', () => {
    const r = run('capture --skip-secrets --json -n e2e-json -- node fail.js', projectDir);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.artifact.path).toContain('e2e-json.bug');
  });

  it('capture should work for a passing command (exit 0)', () => {
    const r = run('capture --skip-secrets -n e2e-pass -- node pass.js', projectDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Artifact captured');
    expect(r.stdout).toContain('exit 0');
  });

  // ── inspect ──

  it('inspect should show artifact details', () => {
    const r = run('inspect e2e-fail.bug', projectDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('e2e-fail');
    expect(r.stdout).toContain('Exit code');
    expect(r.stdout).toContain('Fingerprint');
  });

  it('inspect --json should produce valid JSON', () => {
    const { parsed, status } = runJson('inspect e2e-fail.bug', projectDir);
    expect(status).toBe(0);
    expect(parsed).not.toBeNull();
    expect(parsed.manifest.name).toBe('e2e-fail');
  });

  it('inspect should fail for nonexistent artifact', () => {
    const r = run('inspect nonexistent.bug', projectDir);
    expect(r.status).toBe(1);
  });

  // ── replay ──

  it('replay should confirm reproduction of a captured bug', () => {
    const r = run('replay e2e-fail.bug', projectDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('REPRODUCTION CONFIRMED');
  });

  it('replay --json should produce valid JSON', () => {
    const { parsed, status } = runJson('replay e2e-fail.bug', projectDir);
    expect(status).toBe(0);
    expect(parsed).not.toBeNull();
    expect(parsed.reproduced).toBe(true);
    expect(parsed.verdict.status).toBe('confirmed');
  });

  it('replay should fail for nonexistent artifact', () => {
    const r = run('replay nonexistent.bug', projectDir);
    expect(r.status).toBe(1);
  });

  it('replay should reject artifacts with unknown manifest fields', () => {
    const badDir = path.join(projectDir, 'bad-artifact');
    fs.mkdirSync(badDir, { recursive: true });

    fs.writeFileSync(path.join(badDir, 'manifest.json'), JSON.stringify({
      version: '1.0',
      bugproof_version: '0.2.2',
      name: 'bad-artifact',
      description: 'bad',
      captured_at: new Date().toISOString(),
      captured_on: {
        os: process.platform,
        arch: process.arch,
        node_version: process.version,
      },
      command: ['node', 'fail.js'],
      working_directory: projectDir,
      exit_code: 1,
      duration_ms: 1,
      files_count: 0,
      files_size_bytes: 0,
      secrets_detected: false,
      secrets_skipped: [],
      unknown_field: true,
    }, null, 2));

    fs.writeFileSync(path.join(badDir, 'run.json'), JSON.stringify({
      command: ['node', 'fail.js'],
      working_directory: projectDir,
      environment: {},
      timeout_ms: 300000,
      capture_output: true,
    }, null, 2));

    fs.writeFileSync(path.join(badDir, 'failure.json'), JSON.stringify({
      exit_code: 1,
      signal: null,
      stdout_lines: 0,
      stderr_lines: 1,
      stderr_snippet: 'boom',
      fingerprint: 'abc',
      error_patterns: ['TypeError'],
      duration_ms: 5,
      timeout: false,
    }, null, 2));

    const r = run('replay bad-artifact --json', projectDir);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.reproduced).toBe(false);
    expect(parsed.error).toContain('unknown field');
  });

  it('replay should show Windows best-effort sandbox warning in isolated mode', () => {
    if (process.platform !== 'win32') {
      return;
    }

    const r = run('replay --sandbox isolated e2e-fail.bug', projectDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('best-effort');
  });

  // ── diff ──

  it('diff should show changes between two artifacts', () => {
    const r = run('diff e2e-fail.bug e2e-pass.bug', projectDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Property Changes');
    expect(r.stdout).toContain('exit_code');
  });

  it('diff --json should produce valid JSON', () => {
    const { parsed, status } = runJson('diff e2e-fail.bug e2e-pass.bug', projectDir);
    expect(status).toBe(0);
    expect(parsed).not.toBeNull();
    expect(parsed.identical).toBe(false);
  });

  it('diff should report identical artifacts', () => {
    const r = run('diff e2e-fail.bug e2e-fail.bug', projectDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('identical');
  });

  // ── edge cases ──

  it('capture in non-git directory should work without crashing', () => {
    const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-no-git-'));
    fs.writeFileSync(path.join(noGitDir, 'crash.js'), 'throw new Error("boom");');
    try {
      const r = run('capture --skip-secrets -n no-git-test -- node crash.js', noGitDir);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('Artifact captured');
      expect(r.stdout).toContain('1 files');
    } finally {
      fs.rmSync(noGitDir, { recursive: true, force: true });
    }
  }, 15000);
});
