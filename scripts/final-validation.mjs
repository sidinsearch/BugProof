import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DUMMY_DIR = process.argv[2] || 'D:\\Dummy';
const RESULTS = [];
let testCount = 0;
let passCount = 0;
let failCount = 0;

function findBugproof() {
  const candidates = [
    'bugproof.cmd',
    'bugproof',
    path.join(process.env.APPDATA || '', 'npm', 'bugproof.cmd'),
  ];
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['--version'], { encoding: 'utf-8', timeout: 5000 });
      if (r.status === 0) return c;
    } catch {}
  }
  return 'bugproof.cmd';
}

const BUGPROOF = findBugproof();

function run(cmd, args, opts = {}) {
  const isWin = process.platform === 'win32';
  const spawnCmd = isWin ? 'cmd.exe' : cmd;
  const spawnArgs = isWin ? ['/c', cmd, ...args] : args;
  const result = spawnSync(spawnCmd, spawnArgs, {
    encoding: 'utf-8',
    timeout: opts.timeout || 60000,
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, ...opts.env },
    stdio: opts.stdio || 'pipe',
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function test(name, fn) {
  testCount++;
  try {
    const result = fn();
    if (result) {
      passCount++;
      RESULTS.push({ name, status: 'PASS', detail: typeof result === 'string' ? result : '' });
      process.stdout.write('.');
    } else {
      failCount++;
      RESULTS.push({ name, status: 'FAIL', detail: 'Assertion failed' });
      process.stdout.write('F');
    }
  } catch (err) {
    failCount++;
    RESULTS.push({ name, status: 'FAIL', detail: err.message.substring(0, 100) });
    process.stdout.write('F');
  }
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

// Phase 1: Environment Validation
section('Phase 1: Environment Validation');

test('Node.js available', () => {
  const r = run('node', ['--version']);
  return r.status === 0 && r.stdout.startsWith('v');
});

test('npm available', () => {
  const r = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']);
  return r.status === 0;
});

test(`BugProof CLI (${BUGPROOF})`, () => {
  const r = run(BUGPROOF, ['--version']);
  return r.status === 0 && r.stdout.trim() === '1.3.0';
});

test('BugProof doctor works', () => {
  const r = run(BUGPROOF, ['doctor', '--json']);
  try {
    const data = JSON.parse(r.stdout);
    return data.host && data.capabilities;
  } catch { return false; }
});

test('Git available', () => {
  const r = run('git', ['--version']);
  return r.status === 0;
});

test('Docker available', () => {
  const r = run('docker', ['--version']);
  return r.status === 0;
});

// Phase 2: Runtime Discovery
section('Phase 2: Runtime Discovery');

test('Python available', () => {
  const r = run('python', ['--version']);
  return r.status === 0 || (r.stderr && r.stderr.includes('Python'));
});

test('Java available', () => {
  const r = run('java', ['-version']);
  return r.status === 0 || (r.stderr && r.stderr.includes('version'));
});

test('GCC available', () => {
  const r = run('gcc', ['--version']);
  return r.status === 0;
});

// Phase 3: Dummy Project Validation
section('Phase 3: Dummy Project Validation');

test('Dummy directory exists', () => fs.existsSync(DUMMY_DIR));

const projects = fs.readdirSync(DUMMY_DIR).filter(e => {
  try { return fs.statSync(path.join(DUMMY_DIR, e)).isDirectory(); } catch { return false; }
});

test(`Dummy projects count: ${projects.length} (>=40)`, () => projects.length >= 40);

test('node-clean-success valid', () => {
  const p = path.join(DUMMY_DIR, 'node-clean-success');
  return fs.existsSync(path.join(p, 'package.json')) && fs.existsSync(path.join(p, 'index.js'));
});

test('python-clean-success valid', () => {
  const p = path.join(DUMMY_DIR, 'python-clean-success');
  return fs.existsSync(path.join(p, 'main.py'));
});

test('java-clean-success valid', () => {
  const p = path.join(DUMMY_DIR, 'java-clean-success');
  return fs.existsSync(path.join(p, 'Hello.java'));
});

test('go-clean-success valid', () => {
  const p = path.join(DUMMY_DIR, 'go-clean-success');
  return fs.existsSync(path.join(p, 'main.go'));
});

test('project-large-100mb exists', () => fs.existsSync(path.join(DUMMY_DIR, 'project-large-100mb')));
test('project-thousands-files exists', () => fs.existsSync(path.join(DUMMY_DIR, 'project-thousands-files')));

// Phase 4: Capture Testing
section('Phase 4: Capture Testing');

test('capture: standard failure', () => {
  const r = run(BUGPROOF, ['capture', '-n', 'test-std-fail', '--json', '--skip-secrets', '--', 'node', '-e', 'process.exit(1)'], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.success === true && data.artifact;
  } catch { return false; }
});

test('capture: success case', () => {
  const r = run(BUGPROOF, ['capture', '-n', 'test-std-success', '--json', '--skip-secrets', '--', 'node', '-e', 'console.log("ok")'], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.success === true && data.artifact;
  } catch { return false; }
});

test('capture: with timeout', () => {
  const r = run(BUGPROOF, ['capture', '-n', 'test-timeout', '--json', '--skip-secrets', '--timeout', '2000', '--', 'node', '-e', 'setTimeout(()=>{}, 99999)'], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.success === true && data.artifact;
  } catch { return false; }
});

test('capture: with description', () => {
  const r = run(BUGPROOF, ['capture', '-n', 'test-desc', '-d', 'Test description', '--json', '--skip-secrets', '--', 'node', '-e', 'process.exit(1)'], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.success === true && data.artifact;
  } catch { return false; }
});

test('capture: bare command', () => {
  const r = run(BUGPROOF, ['capture', '-n', 'test-bare', '--json', '--skip-secrets', 'node', '-e', 'process.exit(1)'], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.success === true && data.artifact;
  } catch { return false; }
});

// Phase 4: Replay Testing
section('Phase 4: Replay Testing');

const failArtifact = path.join(DUMMY_DIR, 'test-std-fail.bug');

test('replay: same machine reproduction', () => {
  if (!fs.existsSync(failArtifact)) return false;
  const r = run(BUGPROOF, ['replay', failArtifact, '--json'], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.reproduced === true && data.verdict.status === 'confirmed';
  } catch { return false; }
});

test('replay: with --replay-count', () => {
  if (!fs.existsSync(failArtifact)) return false;
  const r = run(BUGPROOF, ['replay', failArtifact, '--json', '--replay-count', '2'], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.reproduced === true;
  } catch { return false; }
});

test('replay: inspect metadata', () => {
  if (!fs.existsSync(failArtifact)) return false;
  const r = run(BUGPROOF, ['inspect', '--json', failArtifact], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.manifest && data.manifest.name === 'test-std-fail';
  } catch { return false; }
});

// Phase 4: Diff Testing
section('Phase 4: Diff Testing');

const successArtifact = path.join(DUMMY_DIR, 'test-std-success.bug');

test('diff: two different artifacts', () => {
  if (!fs.existsSync(failArtifact) || !fs.existsSync(successArtifact)) return false;
  const r = run(BUGPROOF, ['diff', '--json', failArtifact, successArtifact], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.identical === false && data.changes.length > 0;
  } catch { return false; }
});

// Phase 4: Git Integration
section('Phase 4: Git Integration');

test('capture: clean git repo', () => {
  const r = run(BUGPROOF, ['capture', '-n', 'test-git-clean', '--json', '--skip-secrets', '--', 'node', '-e', 'process.exit(1)'], { cwd: path.join(DUMMY_DIR, 'node-clean-success') });
  try {
    const data = JSON.parse(r.stdout);
    return data.success === true && data.platform && data.platform.git_commit;
  } catch { return false; }
});

test('capture: dirty git repo', () => {
  const r = run(BUGPROOF, ['capture', '-n', 'test-git-dirty', '--json', '--skip-secrets', '--', 'node', '-e', 'process.exit(1)'], { cwd: path.join(DUMMY_DIR, 'project-dirty-git') });
  try {
    const data = JSON.parse(r.stdout);
    return data.success === true;
  } catch { return false; }
});

test('capture: no git repo', () => {
  const r = run(BUGPROOF, ['capture', '-n', 'test-no-git', '--json', '--skip-secrets', '--', 'node', '-e', 'process.exit(1)'], { cwd: path.join(DUMMY_DIR, 'project-no-git') });
  try {
    const data = JSON.parse(r.stdout);
    return data.success === true;
  } catch { return false; }
});

// Phase 4: Cleanup Testing
section('Phase 4: Cleanup Testing');

test('clean: dry run', () => {
  const r = run(BUGPROOF, ['clean', '--json', '--dry-run'], { cwd: DUMMY_DIR });
  try {
    const data = JSON.parse(r.stdout);
    return data.success === true && data.dry_run === true && data.count > 0;
  } catch { return false; }
});

// Phase 4b: MCP Testing
section('Phase 4b: MCP Server Testing');

test('mcp: server starts', () => {
  const r = run(BUGPROOF, ['mcp', '--help']);
  return r.status === 0 && r.stdout.includes('MCP server');
});

// Phase 7: Failure Injection
section('Phase 7: Failure Injection Testing');

test('replay: nonexistent artifact', () => {
  const r = run(BUGPROOF, ['replay', 'nonexistent.bug', '--json'], { cwd: DUMMY_DIR });
  return r.status !== 0;
});

test('inspect: nonexistent artifact', () => {
  const r = run(BUGPROOF, ['inspect', '--json', 'nonexistent.bug'], { cwd: DUMMY_DIR });
  return r.status !== 0;
});

test('diff: missing left artifact', () => {
  const r = run(BUGPROOF, ['diff', '--json', 'missing.bug', failArtifact], { cwd: DUMMY_DIR });
  return r.status !== 0;
});

// Print Results
section('Test Results');

const passResults = RESULTS.filter(r => r.status === 'PASS');
const failResults = RESULTS.filter(r => r.status === 'FAIL');

console.log(`\nTotal: ${testCount} | Passed: ${passCount} | Failed: ${failCount}\n`);

if (failResults.length > 0) {
  console.log('Failed tests:');
  for (const r of failResults) {
    console.log(`  ✗ ${r.name}: ${r.detail}`);
  }
}

console.log('\n' + '='.repeat(60));

process.exit(failCount > 0 ? 1 : 0);
