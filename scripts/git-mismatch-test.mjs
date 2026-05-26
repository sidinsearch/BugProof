// Test git commit mismatch: capture on old commit, replay on latest commit
import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ssh = new NodeSSH();
const results = { winWin: [], winLinux: [], linuxLinux: [], linuxWin: [] };

async function main() {
  console.log('=== Git Commit Mismatch Test ===\n');

  // Windows Test
  console.log('--- Windows: Capture on old commit, replay on latest ---');
  const winTestDir = 'D:\\Dummy\\git-mismatch-test';
  if (fs.existsSync(winTestDir)) fs.rmSync(winTestDir, { recursive: true });
  fs.mkdirSync(winTestDir, { recursive: true });

  execSync('git init -q', { cwd: winTestDir });
  execSync('git config user.email "test@test.com"', { cwd: winTestDir });
  execSync('git config user.name "Test"', { cwd: winTestDir });

  // Commit 1: initial version with bug
  fs.writeFileSync(path.join(winTestDir, 'app.js'), "console.log('v1 - starting');\nthrow new Error('Bug in v1');\n");
  execSync('git add . && git commit -q -m "v1: initial"', { cwd: winTestDir });
  const commit1 = execSync('git rev-parse HEAD', { cwd: winTestDir, encoding: 'utf8' }).trim();
  console.log('  Commit 1 (old): ' + commit1.slice(0, 8));

  // Capture the bug on commit 1
  try {
    execSync('node D:\\BugProof\\dist\\cli.js capture --skip-secrets -n v1-bug -- node app.js', { cwd: winTestDir, stdio: 'pipe' });
  } catch {}
  const bugFile1 = fs.readdirSync(winTestDir).find(f => f.endsWith('.bug'));
  console.log('  Captured: ' + bugFile1);

  // Commit 2: fix the bug
  fs.writeFileSync(path.join(winTestDir, 'app.js'), "console.log('v2 - fixed');\nconsole.log('All good now');\n");
  execSync('git add . && git commit -q -m "v2: fix bug"', { cwd: winTestDir });
  const commit2 = execSync('git rev-parse HEAD', { cwd: winTestDir, encoding: 'utf8' }).trim();
  console.log('  Commit 2 (latest): ' + commit2.slice(0, 8));

  // Replay the v1 bug on the latest commit
  console.log('\n  Testing replay modes:');

  for (const mode of ['current', 'strict', 'branch']) {
    try {
      const replayOut = execSync('node D:\\BugProof\\dist\\cli.js replay ' + bugFile1 + ' --version-match ' + mode, { cwd: winTestDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const confirmed = replayOut.includes('REPRODUCTION CONFIRMED') || replayOut.includes('Reproduction confirmed');
      console.log('    ' + mode + ' mode: ' + (confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'));
      results.winWin.push({ mode, confirmed });
    } catch (e) {
      const output = (e.stdout || '') + (e.stderr || '');
      const confirmed = output.includes('REPRODUCTION CONFIRMED') || output.includes('Reproduction confirmed');
      console.log('    ' + mode + ' mode: ' + (confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'));
      results.winWin.push({ mode, confirmed });
    }
  }

  // Linux Test
  console.log('\n--- Linux: Capture on old commit, replay on latest ---');
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });

  const linuxTestDir = '/tmp/git-mismatch-test';
  await ssh.execCommand('rm -rf ' + linuxTestDir + ' && mkdir -p ' + linuxTestDir);
  await ssh.execCommand('cd ' + linuxTestDir + ' && git init -q && git config user.email "test@test.com" && git config user.name "Test"');

  // Commit 1
  await ssh.execCommand("cd " + linuxTestDir + " && cat > app.js << 'EOF'\nconsole.log('v1 - starting');\nthrow new Error('Bug in v1');\nEOF");
  await ssh.execCommand('cd ' + linuxTestDir + ' && git add . && git commit -q -m "v1: initial"');
  const linuxCommit1 = (await ssh.execCommand('cd ' + linuxTestDir + ' && git rev-parse HEAD')).stdout.trim();
  console.log('  Commit 1 (old): ' + linuxCommit1.slice(0, 8));

  // Capture on commit 1
  await ssh.execCommand('cd ' + linuxTestDir + ' && export PATH=~/.npm-global/bin:$PATH && bugproof capture --skip-secrets -n v1-bug -- node app.js 2>&1 | tail -5');
  const linuxBugFile = (await ssh.execCommand('cd ' + linuxTestDir + ' && ls *.bug 2>/dev/null')).stdout.trim();
  console.log('  Captured: ' + linuxBugFile);

  // Commit 2: fix
  await ssh.execCommand("cd " + linuxTestDir + " && cat > app.js << 'EOF'\nconsole.log('v2 - fixed');\nconsole.log('All good now');\nEOF");
  await ssh.execCommand('cd ' + linuxTestDir + ' && git add . && git commit -q -m "v2: fix bug"');
  const linuxCommit2 = (await ssh.execCommand('cd ' + linuxTestDir + ' && git rev-parse HEAD')).stdout.trim();
  console.log('  Commit 2 (latest): ' + linuxCommit2.slice(0, 8));

  // Replay on Linux
  console.log('\n  Testing replay modes:');
  for (const mode of ['current', 'strict', 'branch']) {
    const replayResult = await ssh.execCommand('cd ' + linuxTestDir + ' && export PATH=~/.npm-global/bin:$PATH && bugproof replay ' + linuxBugFile + ' --version-match ' + mode + ' 2>&1');
    const confirmed = replayResult.stdout.includes('REPRODUCTION CONFIRMED') || replayResult.stdout.includes('Reproduction confirmed');
    console.log('    ' + mode + ' mode: ' + (confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'));
    results.linuxLinux.push({ mode, confirmed });
  }

  // Cross-Platform: Win capture -> Linux replay
  console.log('\n--- Cross-Platform: Windows capture -> Linux replay ---');
  await ssh.execCommand('rm -rf /tmp/linux-replay-test && mkdir -p /tmp/linux-replay-test');
  await ssh.putFile(path.join(winTestDir, bugFile1), '/tmp/linux-replay-test/' + bugFile1);

  for (const mode of ['current', 'strict', 'branch']) {
    const replayResult = await ssh.execCommand('cd /tmp/linux-replay-test && export PATH=~/.npm-global/bin:$PATH && bugproof replay ' + bugFile1 + ' --version-match ' + mode + ' 2>&1');
    const confirmed = replayResult.stdout.includes('REPRODUCTION CONFIRMED') || replayResult.stdout.includes('Reproduction confirmed');
    console.log('    ' + mode + ' mode: ' + (confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'));
    results.winLinux.push({ mode, confirmed });
  }

  // Cross-Platform: Linux capture -> Windows replay
  console.log('\n--- Cross-Platform: Linux capture -> Windows replay ---');
  const winReplayDir = path.join(winTestDir, 'linux-capture-replay');
  if (!fs.existsSync(winReplayDir)) fs.mkdirSync(winReplayDir, { recursive: true });
  await ssh.getFile(path.join(winReplayDir, linuxBugFile), '/tmp/git-mismatch-test/' + linuxBugFile);

  for (const mode of ['current', 'strict', 'branch']) {
    try {
      const replayOut = execSync('node D:\\BugProof\\dist\\cli.js replay ' + linuxBugFile + ' --version-match ' + mode, { cwd: winReplayDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const confirmed = replayOut.includes('REPRODUCTION CONFIRMED') || replayOut.includes('Reproduction confirmed');
      console.log('    ' + mode + ' mode: ' + (confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'));
      results.linuxWin.push({ mode, confirmed });
    } catch (e) {
      const output = (e.stdout || '') + (e.stderr || '');
      const confirmed = output.includes('REPRODUCTION CONFIRMED') || output.includes('Reproduction confirmed');
      console.log('    ' + mode + ' mode: ' + (confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'));
      results.linuxWin.push({ mode, confirmed });
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('  GIT COMMIT MISMATCH TEST RESULTS');
  console.log('========================================\n');

  const allResults = [
    { label: 'Windows->Windows', results: results.winWin },
    { label: 'Linux->Linux', results: results.linuxLinux },
    { label: 'Windows->Linux', results: results.winLinux },
    { label: 'Linux->Windows', results: results.linuxWin },
  ];

  let totalPass = 0, totalTests = 0;
  for (const group of allResults) {
    const pass = group.results.filter(r => r.confirmed).length;
    totalPass += pass;
    totalTests += group.results.length;
    console.log(group.label + ': ' + pass + '/' + group.results.length);
    for (const r of group.results) {
      console.log('  ' + r.mode + ': ' + (r.confirmed ? 'PASS' : 'FAIL'));
    }
  }

  console.log('\nTOTAL: ' + totalPass + '/' + totalTests + ' (' + Math.round(totalPass/totalTests*100) + '%)');

  ssh.dispose();
}

main().catch(e => { console.error(e.message); process.exit(1); });
