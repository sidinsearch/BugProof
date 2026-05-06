#!/usr/bin/env node
// ── BugProof Comprehensive Cross-Platform Test Suite ─────────────────────────
// Tests 14 bug types (8 Node.js + 6 Python) across Windows and Linux.
// Validates: capture, replay, inspect, diff, git context, and cross-platform
// artifact portability.

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { NodeSSH } from 'node-ssh';

// ── Config ──────────────────────────────────────────────────────────────────
const LINUX_HOST = '192.168.31.49';
const LINUX_USER = 'siddharth';
const LINUX_PASS = 'Darknight';
const DUMMY_DIR  = path.resolve(process.cwd(), '..', 'dummy-project');
const BUGPROOF   = path.resolve(process.cwd(), 'dist', 'cli.js');
const RESULTS_DIR = path.resolve(process.cwd(), 'tests', 'e2e', 'results');
const REMOTE_DIR = '/tmp/bugproof-dummy-test';

// ── Bug Definitions ─────────────────────────────────────────────────────────
const BUGS = [
  // Node.js bugs
  { id: 'B1', name: 'SyntaxError',         cmd: 'node',   file: 'bugs/node/B1-syntax-error.js',       lang: 'node' },
  { id: 'B2', name: 'MissingDep',          cmd: 'node',   file: 'bugs/node/B2-missing-dep.js',        lang: 'node' },
  { id: 'B3', name: 'MissingEnvVar',       cmd: 'node',   file: 'bugs/node/B3-missing-env.js',        lang: 'node' },
  { id: 'B4', name: 'PermissionError',     cmd: 'node',   file: 'bugs/node/B4-permission-error.js',   lang: 'node' },
  { id: 'B5', name: 'Timeout',             cmd: 'node',   file: 'bugs/node/B5-timeout.js',            lang: 'node', timeout: 3 },
  { id: 'B6', name: 'UnhandledRejection',  cmd: 'node',   file: 'bugs/node/B6-unhandled-rejection.js', lang: 'node' },
  { id: 'B7', name: 'TypeError',           cmd: 'node',   file: 'bugs/node/B7-type-error.js',         lang: 'node' },
  { id: 'B8', name: 'StackOverflow',       cmd: 'node',   file: 'bugs/node/B8-stack-overflow.js',     lang: 'node' },
  // Python bugs
  { id: 'P1', name: 'PySyntaxError',       cmd: 'python', file: 'bugs/python/P1-syntax-error.py',     lang: 'python' },
  { id: 'P2', name: 'PyImportError',       cmd: 'python', file: 'bugs/python/P2-import-error.py',     lang: 'python' },
  { id: 'P3', name: 'PyTypeError',         cmd: 'python', file: 'bugs/python/P3-type-error.py',       lang: 'python' },
  { id: 'P4', name: 'PyKeyError',          cmd: 'python', file: 'bugs/python/P4-key-error.py',        lang: 'python' },
  { id: 'P5', name: 'PyZeroDivision',      cmd: 'python', file: 'bugs/python/P5-zero-division.py',    lang: 'python' },
  { id: 'P6', name: 'PyRecursionError',    cmd: 'python', file: 'bugs/python/P6-recursion-error.py',  lang: 'python' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function hr() { console.log('─'.repeat(60)); }

function run(cmd, opts = {}) {
  const result = spawnSync(cmd, { shell: true, encoding: 'utf-8', timeout: 30000, ...opts });
  return { stdout: result.stdout || '', stderr: result.stderr || '', code: result.status, ok: result.status === 0 };
}

function captureOnWindows(bug) {
  const timeoutFlag = bug.timeout ? `--timeout ${bug.timeout}` : '';
  const pyCmd = bug.cmd === 'python' ? 'python' : 'node';
  const cmd = `node "${BUGPROOF}" capture ${timeoutFlag} -- ${pyCmd} ${bug.file}`;
  const r = run(cmd, { cwd: DUMMY_DIR });
  const combined = r.stdout + r.stderr;
  const m = combined.match(/bug_\d+\.bug/);
  return m ? m[0] : null;
}

function replayOnWindows(artifactFile) {
  const full = path.join(DUMMY_DIR, artifactFile);
  const cmd = `node "${BUGPROOF}" replay --version-match strict "${full}"`;
  const r = run(cmd, { cwd: DUMMY_DIR });
  const combined = r.stdout + r.stderr;
  return combined.includes('confirmed') || combined.includes('reproduced') || combined.includes('Verdict');
}

function inspectOnWindows(artifactFile) {
  const full = path.join(DUMMY_DIR, artifactFile);
  const cmd = `node "${BUGPROOF}" inspect "${full}"`;
  const r = run(cmd, { cwd: DUMMY_DIR });
  return { ok: r.code === 0, output: r.stdout + r.stderr };
}

async function captureOnLinux(ssh, bug) {
  const pyCmd = bug.cmd === 'python' ? 'python3' : 'node';
  const timeoutFlag = bug.timeout ? `--timeout ${bug.timeout}` : '';
  const cmd = `cd ${REMOTE_DIR}/dummy && bugproof capture ${timeoutFlag} -- ${pyCmd} ${bug.file}`;
  const r = await ssh.execCommand(cmd);
  const combined = (r.stdout || '') + (r.stderr || '');
  const m = combined.match(/bug_\d+\.bug/);
  return m ? m[0] : null;
}

async function replayOnLinux(ssh, artifactPath) {
  const cmd = `cd ${REMOTE_DIR}/dummy && bugproof replay --version-match strict "${artifactPath}"`;
  const r = await ssh.execCommand(cmd);
  const combined = (r.stdout || '') + (r.stderr || '');
  return combined.includes('confirmed') || combined.includes('reproduced') || combined.includes('Verdict');
}

// ── Main Pipeline ───────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪 BugProof Comprehensive Cross-Platform Test Suite');
  hr();

  const results = [];
  const ssh = new NodeSSH();

  // ── Phase 0: Verify local tools ───────────────────────────────────────────
  console.log('\n📋 Phase 0: Pre-flight checks');
  hr();

  const nodeV = run('node --version');
  console.log(`  🪟 Windows Node: ${nodeV.stdout.trim()}`);
  const pyV = run('python --version');
  console.log(`  🪟 Windows Python: ${pyV.stdout.trim()}`);
  const gitV = run('git log --oneline -5', { cwd: DUMMY_DIR });
  console.log(`  📜 Git history:\n${gitV.stdout.split('\n').map(l => `     ${l}`).join('\n')}`);

  // ── Phase 1: Build + pack BugProof ────────────────────────────────────────
  console.log('\n📦 Phase 1: Build & Pack');
  hr();

  console.log('  🔨 Building BugProof...');
  run('npm run build', { cwd: path.resolve(DUMMY_DIR, '..', 'bugproof') });

  console.log('  📦 Packing tarball...');
  run('npm pack --pack-destination .', { cwd: path.resolve(DUMMY_DIR, '..', 'bugproof') });
  const tgzPath = path.join(path.resolve(DUMMY_DIR, '..', 'bugproof'), 'bugproof-0.1.0.tgz');

  // ── Phase 2: Setup Linux ──────────────────────────────────────────────────
  console.log('\n🐧 Phase 2: Setup Linux environment');
  hr();

  try {
    await ssh.connect({ host: LINUX_HOST, username: LINUX_USER, password: LINUX_PASS, readyTimeout: 10000 });
    console.log('  ✅ SSH connected');
  } catch (e) {
    console.log(`  ❌ SSH connection failed: ${e.message}`);
    console.log('  ⏩ Skipping Linux tests, running Windows-only suite');

    // Run windows-only tests
    await runWindowsTests(results);
    writeReport(results);
    return;
  }

  // Check remote Node/Python
  const remoteNode = await ssh.execCommand('node --version');
  console.log(`  🐧 Linux Node: ${(remoteNode.stdout || '').trim()}`);
  const remotePy = await ssh.execCommand('python3 --version');
  console.log(`  🐧 Linux Python: ${(remotePy.stdout || '').trim()}`);

  // Transfer and install
  console.log('  📤 Transferring tarball...');
  await ssh.execCommand(`rm -rf ${REMOTE_DIR} && mkdir -p ${REMOTE_DIR}/dummy`);
  await ssh.putFile(tgzPath, `${REMOTE_DIR}/bugproof-0.1.0.tgz`);

  console.log('  📤 Transferring dummy project...');
  await ssh.putDirectory(DUMMY_DIR, `${REMOTE_DIR}/dummy`, {
    recursive: true,
    validate: (itemPath) => !itemPath.includes('.git') && !itemPath.includes('node_modules') && !itemPath.includes('.bug')
  });

  console.log('  📥 Installing BugProof on Linux...');
  const installResult = await ssh.execCommand(`echo ${LINUX_PASS} | sudo -S npm install -g ${REMOTE_DIR}/bugproof-0.1.0.tgz --force 2>&1`);
  console.log(`  📥 Install output: ${(installResult.stdout || '').slice(-200)}`);

  // Init git on Linux
  console.log('  📜 Initializing git on Linux...');
  await ssh.execCommand(`cd ${REMOTE_DIR}/dummy && git init && git add -A && git commit -m "imported from Windows" 2>&1`);

  const remoteBugproof = await ssh.execCommand('bugproof --help 2>&1');
  const helpOutput = (remoteBugproof.stdout || '') + (remoteBugproof.stderr || '');
  if (!helpOutput.includes('capture')) {
    console.log('  ❌ BugProof not properly installed on Linux');
    console.log(`     Help output: ${helpOutput.slice(0, 300)}`);
    ssh.dispose();
    return;
  }
  console.log('  ✅ BugProof installed on Linux');

  // ── Phase 3: Run full matrix ──────────────────────────────────────────────
  console.log('\n🔬 Phase 3: Bug Matrix (14 bugs × 4 directions)');
  hr();

  for (const bug of BUGS) {
    console.log(`\n  Testing ${bug.id}: ${bug.name}`);
    console.log('  ' + '─'.repeat(50));

    // ── Win→Win ─────────────────────────────────────────────────────────────
    process.stdout.write(`    🪟→🪟 Win capture + Win replay...`);
    const winArtifact = captureOnWindows(bug);
    if (!winArtifact) {
      console.log(' ❌ Capture failed');
      results.push({ bug: bug.id, name: bug.name, direction: 'Win→Win', status: 'FAIL', reason: 'capture failed' });
    } else {
      const replayed = replayOnWindows(winArtifact);
      const status = replayed ? 'PASS' : 'FAIL';
      console.log(replayed ? ' ✅' : ' ❌');
      results.push({ bug: bug.id, name: bug.name, direction: 'Win→Win', status, artifact: winArtifact });
    }

    // ── Win→Linux ───────────────────────────────────────────────────────────
    if (winArtifact) {
      process.stdout.write(`    🪟→🐧 Win artifact → Linux replay...`);
      const localPath = path.join(DUMMY_DIR, winArtifact);
      if (fs.existsSync(localPath)) {
        await ssh.putFile(localPath, `${REMOTE_DIR}/dummy/${winArtifact}`);
        const replayed = await replayOnLinux(ssh, winArtifact);
        console.log(replayed ? ' ✅' : ' ❌');
        results.push({ bug: bug.id, name: bug.name, direction: 'Win→Linux', status: replayed ? 'PASS' : 'FAIL', artifact: winArtifact });
      } else {
        console.log(' ❌ artifact not found');
        results.push({ bug: bug.id, name: bug.name, direction: 'Win→Linux', status: 'FAIL', reason: 'artifact not found' });
      }
    }

    // ── Linux→Linux ─────────────────────────────────────────────────────────
    process.stdout.write(`    🐧→🐧 Linux capture + Linux replay...`);
    const linuxArtifact = await captureOnLinux(ssh, bug);
    if (!linuxArtifact) {
      console.log(' ❌ Capture failed');
      results.push({ bug: bug.id, name: bug.name, direction: 'Linux→Linux', status: 'FAIL', reason: 'capture failed' });
    } else {
      const replayed = await replayOnLinux(ssh, linuxArtifact);
      console.log(replayed ? ' ✅' : ' ❌');
      results.push({ bug: bug.id, name: bug.name, direction: 'Linux→Linux', status: replayed ? 'PASS' : 'FAIL', artifact: linuxArtifact });
    }

    // ── Linux→Win ───────────────────────────────────────────────────────────
    if (linuxArtifact) {
      process.stdout.write(`    🐧→🪟 Linux artifact → Win replay...`);
      const remotePath = `${REMOTE_DIR}/dummy/${linuxArtifact}`;
      const localDest = path.join(DUMMY_DIR, linuxArtifact);
      try {
        await ssh.getFile(localDest, remotePath);
        const replayed = replayOnWindows(linuxArtifact);
        console.log(replayed ? ' ✅' : ' ❌');
        results.push({ bug: bug.id, name: bug.name, direction: 'Linux→Win', status: replayed ? 'PASS' : 'FAIL', artifact: linuxArtifact });
      } catch (e) {
        // .bug might be a directory, try tar approach
        try {
          await ssh.execCommand(`cd ${REMOTE_DIR}/dummy && tar czf /tmp/${linuxArtifact}.tgz ${linuxArtifact}`);
          await ssh.getFile(localDest + '.tgz', `/tmp/${linuxArtifact}.tgz`);
          run(`tar xzf "${localDest}.tgz"`, { cwd: DUMMY_DIR });
          const replayed = replayOnWindows(linuxArtifact);
          console.log(replayed ? ' ✅' : ' ❌');
          results.push({ bug: bug.id, name: bug.name, direction: 'Linux→Win', status: replayed ? 'PASS' : 'FAIL', artifact: linuxArtifact });
        } catch (e2) {
          console.log(` ❌ transfer failed: ${e2.message}`);
          results.push({ bug: bug.id, name: bug.name, direction: 'Linux→Win', status: 'FAIL', reason: 'transfer failed' });
        }
      }
    }

    // Clean up .bug artifacts from dummy project to keep it tidy
    try {
      if (winArtifact) {
        const p = path.join(DUMMY_DIR, winArtifact);
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
      }
      if (linuxArtifact) {
        const p = path.join(DUMMY_DIR, linuxArtifact);
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
        const tgz = path.join(DUMMY_DIR, linuxArtifact + '.tgz');
        if (fs.existsSync(tgz)) fs.unlinkSync(tgz);
      }
    } catch {}
  }

  // ── Phase 4: Inspect + Git context tests ──────────────────────────────────
  console.log('\n\n🔍 Phase 4: Inspect & Git Context Validation');
  hr();

  // Capture a fresh artifact and inspect it
  process.stdout.write('  Inspecting a fresh B7 artifact...');
  const inspectArt = captureOnWindows(BUGS.find(b => b.id === 'B7'));
  if (inspectArt) {
    const insp = inspectOnWindows(inspectArt);
    const hasGit = insp.output.includes('Git') || insp.output.includes('git') || insp.output.includes('master');
    console.log(insp.ok ? ' ✅' : ' ❌');
    console.log(`    Git context present: ${hasGit ? '✅ yes' : '❌ no'}`);
    results.push({ bug: 'INSPECT', name: 'InspectCommand', direction: 'Win', status: insp.ok ? 'PASS' : 'FAIL' });
    results.push({ bug: 'GIT_CTX', name: 'GitContext', direction: 'Win', status: hasGit ? 'PASS' : 'FAIL' });

    // Clean up
    try { fs.rmSync(path.join(DUMMY_DIR, inspectArt), { recursive: true, force: true }); } catch {}
  }

  // ── Phase 5: Diff test ────────────────────────────────────────────────────
  console.log('\n🔀 Phase 5: Diff Validation');
  hr();

  process.stdout.write('  Capturing two B3 artifacts for diff...');
  const diffA = captureOnWindows(BUGS.find(b => b.id === 'B3'));
  const diffB = captureOnWindows(BUGS.find(b => b.id === 'B3'));
  if (diffA && diffB) {
    const fullA = path.join(DUMMY_DIR, diffA);
    const fullB = path.join(DUMMY_DIR, diffB);
    const diffCmd = `node "${BUGPROOF}" diff "${fullA}" "${fullB}"`;
    const diffResult = run(diffCmd, { cwd: DUMMY_DIR });
    const diffOk = diffResult.code === 0;
    console.log(diffOk ? ' ✅' : ' ❌');
    results.push({ bug: 'DIFF', name: 'DiffCommand', direction: 'Win', status: diffOk ? 'PASS' : 'FAIL' });
    try { fs.rmSync(fullA, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(fullB, { recursive: true, force: true }); } catch {}
  } else {
    console.log(' ❌ could not capture both artifacts');
    results.push({ bug: 'DIFF', name: 'DiffCommand', direction: 'Win', status: 'FAIL' });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await ssh.execCommand(`rm -rf ${REMOTE_DIR}`);
  ssh.dispose();

  // Clean up tarball
  try { fs.unlinkSync(tgzPath); } catch {}

  // ── Report ────────────────────────────────────────────────────────────────
  writeReport(results);
}

async function runWindowsTests(results) {
  for (const bug of BUGS) {
    if (bug.cmd === 'python') {
      const pyCmd = 'python';
      // verify python is available
      const pyCheck = run(`${pyCmd} --version`);
      if (!pyCheck.ok) {
        results.push({ bug: bug.id, name: bug.name, direction: 'Win→Win', status: 'SKIP', reason: 'python not available' });
        continue;
      }
    }

    process.stdout.write(`  🪟 ${bug.id} (${bug.name}) Win→Win...`);
    const art = captureOnWindows(bug);
    if (!art) {
      console.log(' ❌ Capture failed');
      results.push({ bug: bug.id, name: bug.name, direction: 'Win→Win', status: 'FAIL', reason: 'capture failed' });
    } else {
      const replayed = replayOnWindows(art);
      console.log(replayed ? ' ✅' : ' ❌');
      results.push({ bug: bug.id, name: bug.name, direction: 'Win→Win', status: replayed ? 'PASS' : 'FAIL' });
      try { fs.rmSync(path.join(DUMMY_DIR, art), { recursive: true, force: true }); } catch {}
    }
  }
}

function writeReport(results) {
  console.log('\n\n📊 Final Report');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const total = results.length;

  // Table header
  console.log(`  ${'Bug'.padEnd(10)} ${'Name'.padEnd(22)} ${'Direction'.padEnd(14)} ${'Status'.padEnd(8)}`);
  console.log('  ' + '─'.repeat(60));

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏩';
    console.log(`  ${r.bug.padEnd(10)} ${r.name.padEnd(22)} ${r.direction.padEnd(14)} ${icon}`);
  }

  console.log('  ' + '─'.repeat(60));
  console.log(`  Total: ${total} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
  console.log('═'.repeat(70));

  // Write JSON report
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const reportFile = path.join(RESULTS_DIR, `comprehensive-report-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({ timestamp: new Date().toISOString(), total, passed, failed, skipped, results }, null, 2));
  console.log(`\n📄 Report: ${reportFile}`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed!`);
    process.exit(1);
  } else {
    console.log(`\n🎉 All ${passed} tests passed!`);
  }
}

main().catch(err => {
  console.error('💥 Pipeline Error:', err);
  process.exit(1);
});
