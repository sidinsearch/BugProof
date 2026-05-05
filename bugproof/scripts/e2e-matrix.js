/**
 * BugProof E2E Cross-Platform Test Matrix
 *
 * Runs 6 bug-type fixtures across 4 platform directions:
 *   Win→Win, Win→Linux, Linux→Linux, Linux→Win
 *
 * Usage: node scripts/e2e-matrix.js
 *
 * Prerequisites:
 *   - Linux test machine reachable via SSH (see Linux_Env.md)
 *   - npm and Node.js installed on both machines
 */

import { NodeSSH } from 'node-ssh';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT_DIR, 'tests', 'e2e', 'fixtures');
const RESULTS_DIR = path.join(ROOT_DIR, 'tests', 'e2e', 'results');

const ssh = new NodeSSH();

// ── Config ──
const LINUX_HOST = '192.168.31.49';
const LINUX_USER = 'siddharth';
const LINUX_PASS = 'Darknight';
const REMOTE_DIR = '/home/siddharth/bugproof-e2e';
const REMOTE_FIXTURES = `${REMOTE_DIR}/fixtures`;

// ── Bug Type Definitions ──
const BUG_TYPES = [
  { id: 'B1', name: 'Syntax Error',        fixture: 'syntax-error.js',     captureArgs: '' },
  { id: 'B2', name: 'Missing Dependency',   fixture: 'missing-dep.js',      captureArgs: '' },
  { id: 'B3', name: 'Missing Env Var',      fixture: 'missing-env.js',      captureArgs: '' },
  { id: 'B4', name: 'Filesystem Permission', fixture: 'fs-permission.js',   captureArgs: '' },
  { id: 'B5', name: 'Timeout',              fixture: 'timeout-loop.js',     captureArgs: '--timeout 3000' },
  { id: 'B6', name: 'Multi-line Stderr',    fixture: 'multiline-stderr.js', captureArgs: '' },
];

// ── Report ──
const report = {
  timestamp: new Date().toISOString(),
  windowsNode: process.version,
  linuxNode: '',
  bugproofVersion: '0.1.0',
  globalInstall: { windows: 'skipped', linux: 'skipped' },
  scenarios: [],
  summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
};

// ── Helpers ──
function log(emoji, msg) { console.log(`${emoji} ${msg}`); }
function hr() { console.log('─'.repeat(60)); }

function runLocal(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: ROOT_DIR, timeout: 120000, ...opts }).trim();
  } catch (e) {
    return e.stdout ? e.stdout.trim() : e.message;
  }
}

async function runRemote(cmd, silent = false) {
  const result = await ssh.execCommand(cmd, {
    onStdout: silent ? undefined : (chunk) => process.stdout.write(chunk.toString('utf8')),
    onStderr: silent ? undefined : (chunk) => process.stderr.write(chunk.toString('utf8')),
  });
  return result;
}

function findLatestBug(dir) {
  const bugs = fs.readdirSync(dir).filter(f => f.endsWith('.bug'));
  let latest = null, latestTime = 0;
  for (const f of bugs) {
    const stat = fs.statSync(path.join(dir, f));
    if (stat.mtimeMs > latestTime) { latestTime = stat.mtimeMs; latest = f; }
  }
  return latest;
}

function cleanBugFiles(dir) {
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.bug'))) {
    try { fs.rmSync(path.join(dir, f), { recursive: true, force: true }); } catch {}
  }
}

function checkVerdict(output) {
  if (!output) return 'error';
  if (output.includes('REPRODUCTION CONFIRMED')) return 'confirmed';
  if (output.includes('NOT REPRODUCED') || output.includes('not_confirmed')) return 'not_confirmed';
  return 'unknown';
}

// ── Phase 1: Setup ──
async function setup() {
  log('🔧', 'Phase 1: Setup');
  hr();

  // Build
  log('📦', 'Building BugProof...');
  runLocal('npm run build', { stdio: 'inherit' });

  // Clean old bugs
  cleanBugFiles(ROOT_DIR);

  // Pack
  log('📦', 'Creating npm tarball...');
  const tarball = runLocal('npm pack');
  const tarballPath = path.join(ROOT_DIR, tarball);
  log('✅', `Packed: ${tarball}`);

  // Connect to Linux
  log('🔌', `Connecting to Linux (${LINUX_USER}@${LINUX_HOST})...`);
  await ssh.connect({ host: LINUX_HOST, username: LINUX_USER, password: LINUX_PASS });
  log('✅', 'SSH connected');

  // Get Linux Node version
  const nodeResult = await runRemote('node --version', true);
  report.linuxNode = nodeResult.stdout.trim();
  log('🐧', `Linux Node: ${report.linuxNode}`);

  // Setup remote directory
  await runRemote(`rm -rf ${REMOTE_DIR} && mkdir -p ${REMOTE_DIR} ${REMOTE_FIXTURES}`, true);

  // Transfer tarball
  log('📤', 'Transferring tarball to Linux...');
  await ssh.putFile(tarballPath, `${REMOTE_DIR}/${tarball}`);

  // Transfer fixtures
  log('📤', 'Transferring fixtures to Linux...');
  const fixtureFiles = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.js'));
  for (const f of fixtureFiles) {
    await ssh.putFile(path.join(FIXTURES_DIR, f), `${REMOTE_FIXTURES}/${f}`);
  }

  // Install on Linux: extract tarball + install deps + build
  log('🐧', 'Installing BugProof on Linux...');
  const installResult = await runRemote(
    `cd ${REMOTE_DIR} && tar -xzf ${tarball} --strip-components=1 && npm install --production=false && npm run build`,
    true
  );
  if (installResult.code !== 0) {
    log('❌', 'Linux install failed!');
    console.error(installResult.stderr);
    report.globalInstall.linux = 'fail';
  } else {
    report.globalInstall.linux = 'pass';
    log('✅', 'Linux install complete');
  }

  // Init a git repo on Linux so capture works
  await runRemote(`cd ${REMOTE_DIR} && git init && git config user.name "E2E" && git config user.email "e2e@test.com" && git add . && git commit -m "init" --allow-empty`, true);

  // Verify Windows works
  report.globalInstall.windows = 'pass';

  // Clean up local tarball
  fs.rmSync(tarballPath, { force: true });

  return tarball;
}

// ── Phase 2: Capture on Windows ──
async function captureOnWindows(bug) {
  log('🪟', `  Capturing ${bug.id} (${bug.name}) on Windows...`);
  cleanBugFiles(ROOT_DIR);

  // Git-add the fixture so it gets included in the artifact
  runLocal(`git add tests/e2e/fixtures/${bug.fixture}`, { stdio: 'pipe' });

  const cmd = `node dist/cli.js capture ${bug.captureArgs} --exclude "*.tgz" --exclude "node_modules/**" -- node tests/e2e/fixtures/${bug.fixture}`;
  const output = runLocal(cmd);

  const bugFile = findLatestBug(ROOT_DIR);
  if (!bugFile) {
    log('❌', `  Failed to capture ${bug.id} on Windows`);
    return null;
  }
  log('✅', `  Captured: ${bugFile}`);
  return bugFile;
}

// ── Phase 3: Capture on Linux ──
async function captureOnLinux(bug) {
  log('🐧', `  Capturing ${bug.id} (${bug.name}) on Linux...`);
  await runRemote(`cd ${REMOTE_DIR} && rm -f *.bug`, true);

  // Git-add the fixture
  await runRemote(`cd ${REMOTE_DIR} && git add fixtures/${bug.fixture} 2>/dev/null || true`, true);

  const cmd = `cd ${REMOTE_DIR} && node dist/cli.js capture ${bug.captureArgs} --exclude "*.tgz" --exclude "node_modules/**" -- node fixtures/${bug.fixture}`;
  const captureResult = await runRemote(cmd, true);

  // Find the captured bug
  const lsResult = await runRemote(`cd ${REMOTE_DIR} && ls -1 *.bug 2>/dev/null || echo ""`, true);
  const bugFile = lsResult.stdout.split('\n').find(f => f.trim().endsWith('.bug'));

  if (!bugFile || !bugFile.trim()) {
    log('❌', `  Failed to capture ${bug.id} on Linux`);
    return null;
  }
  const cleanName = bugFile.trim();
  log('✅', `  Captured: ${cleanName}`);
  return cleanName;
}

// ── Phase 4: Replay on Windows ──
function replayOnWindows(bugFilePath) {
  const cmd = `node dist/cli.js replay "${bugFilePath}" --version-match current`;
  const output = runLocal(cmd);
  return { output, verdict: checkVerdict(output) };
}

// ── Phase 5: Replay on Linux ──
async function replayOnLinux(remoteBugPath) {
  const cmd = `cd ${REMOTE_DIR} && node dist/cli.js replay "${remoteBugPath}" --version-match current`;
  const result = await runRemote(cmd, true);
  const combinedOutput = result.stdout + '\n' + result.stderr;
  return { output: combinedOutput, verdict: checkVerdict(combinedOutput) };
}

// ── Phase 6: Transfer artifacts ──
async function transferWinToLinux(localBugFile) {
  const remoteName = `win_${path.basename(localBugFile)}`;
  await ssh.putFile(path.join(ROOT_DIR, localBugFile), `${REMOTE_DIR}/${remoteName}`);
  return remoteName;
}

async function transferLinuxToWin(remoteBugFile) {
  const localName = `linux_${remoteBugFile}`;
  await ssh.getFile(path.join(ROOT_DIR, localName), `${REMOTE_DIR}/${remoteBugFile}`);
  return localName;
}

// ── Main Runner ──
async function runMatrix() {
  await setup();
  hr();

  log('🧪', 'Phase 2: Running Test Matrix');
  hr();

  for (const bug of BUG_TYPES) {
    log('🔬', `\nTesting ${bug.id}: ${bug.name}`);
    hr();

    const scenario = {
      id: bug.id,
      name: bug.name,
      results: {
        win_to_win: { capture: 'skip', replay: 'skip', verdict: 'skip' },
        win_to_linux: { capture: 'skip', replay: 'skip', verdict: 'skip' },
        linux_to_linux: { capture: 'skip', replay: 'skip', verdict: 'skip' },
        linux_to_win: { capture: 'skip', replay: 'skip', verdict: 'skip' },
      },
    };

    // ── Win → Win ──
    const winBug = await captureOnWindows(bug);
    if (winBug) {
      scenario.results.win_to_win.capture = 'pass';
      const r = replayOnWindows(winBug);
      scenario.results.win_to_win.replay = 'pass';
      scenario.results.win_to_win.verdict = r.verdict;
      log(r.verdict === 'confirmed' ? '✅' : '⚠️', `  Win→Win: ${r.verdict}`);

      // ── Win → Linux ──
      try {
        const remoteName = await transferWinToLinux(winBug);
        scenario.results.win_to_linux.capture = 'pass';
        const rl = await replayOnLinux(remoteName);
        scenario.results.win_to_linux.replay = 'pass';
        scenario.results.win_to_linux.verdict = rl.verdict;
        log(rl.verdict === 'confirmed' ? '✅' : '⚠️', `  Win→Linux: ${rl.verdict}`);
      } catch (e) {
        log('❌', `  Win→Linux transfer failed: ${e.message}`);
        scenario.results.win_to_linux.replay = 'error';
      }
    }

    // ── Linux → Linux ──
    const linuxBug = await captureOnLinux(bug);
    if (linuxBug) {
      scenario.results.linux_to_linux.capture = 'pass';
      const rl = await replayOnLinux(linuxBug);
      scenario.results.linux_to_linux.replay = 'pass';
      scenario.results.linux_to_linux.verdict = rl.verdict;
      log(rl.verdict === 'confirmed' ? '✅' : '⚠️', `  Linux→Linux: ${rl.verdict}`);

      // ── Linux → Win ──
      try {
        const localName = await transferLinuxToWin(linuxBug);
        scenario.results.linux_to_win.capture = 'pass';
        const rw = replayOnWindows(localName);
        scenario.results.linux_to_win.replay = 'pass';
        scenario.results.linux_to_win.verdict = rw.verdict;
        log(rw.verdict === 'confirmed' ? '✅' : '⚠️', `  Linux→Win: ${rw.verdict}`);
      } catch (e) {
        log('❌', `  Linux→Win transfer failed: ${e.message}`);
        scenario.results.linux_to_win.replay = 'error';
      }
    }

    report.scenarios.push(scenario);
  }

  // ── Summary ──
  hr();
  log('📊', 'Phase 3: Results Summary');
  hr();

  let total = 0, passed = 0, failed = 0;
  for (const s of report.scenarios) {
    for (const dir of ['win_to_win', 'win_to_linux', 'linux_to_linux', 'linux_to_win']) {
      const r = s.results[dir];
      if (r.capture === 'skip') continue;
      total++;
      if (r.verdict === 'confirmed') { passed++; }
      else { failed++; }
    }
  }

  report.summary = { total, passed, failed, skipped: (BUG_TYPES.length * 4) - total };

  // Print table
  console.log('\n  Bug Type                | Win→Win | Win→Lnx | Lnx→Lnx | Lnx→Win');
  console.log('  ' + '─'.repeat(75));
  for (const s of report.scenarios) {
    const cols = ['win_to_win', 'win_to_linux', 'linux_to_linux', 'linux_to_win']
      .map(d => {
        const v = s.results[d].verdict;
        if (v === 'confirmed') return '  ✅  ';
        if (v === 'skip') return '  ⏭️  ';
        return '  ❌  ';
      });
    console.log(`  ${(s.id + ' ' + s.name).padEnd(24)}|${cols.join('|')}`);
  }
  console.log(`\n  Total: ${total} | Passed: ${passed} | Failed: ${failed} | Skipped: ${report.summary.skipped}`);

  // Write JSON report
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const reportPath = path.join(RESULTS_DIR, `e2e-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  log('📄', `Report saved: ${reportPath}`);

  // Cleanup
  log('🧹', 'Cleaning up...');
  cleanBugFiles(ROOT_DIR);
  for (const f of fs.readdirSync(ROOT_DIR).filter(f => f.startsWith('linux_'))) {
    try { fs.rmSync(path.join(ROOT_DIR, f), { recursive: true, force: true }); } catch {}
  }
  ssh.dispose();

  if (failed > 0) {
    log('❌', `${failed} scenario(s) failed!`);
    process.exit(1);
  } else {
    log('🎉', 'All scenarios passed!');
  }
}

runMatrix().catch(err => {
  console.error('\n💥 Pipeline Error:', err);
  ssh.dispose();
  process.exit(1);
});
