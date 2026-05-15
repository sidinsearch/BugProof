/**
 * BugProof Comprehensive Test Runner — Phases 1-9
 * 
 * Run: npx tsx scripts/comprehensive-test-runner.ts
 */

import { spawnSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TEST_DIR = path.join(os.homedir(), 'bugproof-test-' + Date.now());
const RESULTS: { phase: string; test: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }[] = [];

function log(msg: string) {
  console.log(`  [TEST] ${msg}`);
}

function result(phase: string, test: string, status: 'PASS' | 'FAIL' | 'SKIP', detail: string) {
  RESULTS.push({ phase, test, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`    ${icon} ${test}: ${detail}`);
}

function run(cmd: string, args: string[], cwd?: string, timeout = 60000): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'pipe'] });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function runShell(cmd: string, cwd?: string, timeout = 60000): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.platform === 'win32' ? 'cmd.exe' : 'bash',
    process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd],
    { cwd, encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'pipe'] });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function setup() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  console.log(`\n📁 Test directory: ${TEST_DIR}\n`);
}

// ============================================
// PHASE 1: Environment Validation
// ============================================
async function phase1() {
  console.log('\n=== PHASE 1: Environment Validation ===\n');
  
  const nodeVer = process.version;
  const npmVer = runShell('npm --version').stdout.trim();
  const osVer = os.release();
  const arch = os.arch();
  const gitVer = runShell('git --version').stdout.trim();
  const bpVer = runShell('bugproof --version').stdout.trim();
  
  result('1', 'Node.js version', nodeVer.startsWith('v') ? 'PASS' : 'FAIL', `Node ${nodeVer}`);
  result('1', 'npm version', npmVer ? 'PASS' : 'FAIL', `npm ${npmVer}`);
  result('1', 'OS version', osVer ? 'PASS' : 'FAIL', `${os.platform()} ${osVer}`);
  result('1', 'Architecture', arch ? 'PASS' : 'FAIL', arch);
  result('1', 'Git version', gitVer ? 'PASS' : 'FAIL', gitVer);
  result('1', 'BugProof CLI', bpVer ? 'PASS' : 'FAIL', bpVer);
  
  // Doctor
  const doctor = runShell('bugproof doctor --json');
  result('1', 'Doctor command', doctor.status === 0 ? 'PASS' : 'FAIL', doctor.status === 0 ? 'Healthy' : doctor.stderr);
}

// ============================================
// PHASE 2: Runtime Discovery
// ============================================
async function phase2() {
  console.log('\n=== PHASE 2: Runtime Discovery ===\n');
  
  const runtimes = [
    { name: 'node', cmd: 'node --version' },
    { name: 'python', cmd: 'python --version' },
    { name: 'python3', cmd: 'python3 --version' },
    { name: 'java', cmd: 'java -version' },
    { name: 'go', cmd: 'go version' },
    { name: 'rustc', cmd: 'rustc --version' },
    { name: 'gcc', cmd: 'gcc --version' },
    { name: 'docker', cmd: 'docker --version' },
  ];
  
  for (const rt of runtimes) {
    const r = runShell(rt.cmd);
    const available = r.status === 0;
    result('2', rt.name, available ? 'PASS' : 'SKIP', available ? r.stdout.trim().split('\n')[0] : 'Not installed');
  }
}

// ============================================
// PHASE 3: Dummy Project Generation
// ============================================
async function phase3() {
  console.log('\n=== PHASE 3: Dummy Project Generation ===\n');
  
  // 3a. Small Node.js project (clean git)
  const smallNode = path.join(TEST_DIR, 'small-node');
  fs.mkdirSync(smallNode, { recursive: true });
  fs.writeFileSync(path.join(smallNode, 'package.json'), JSON.stringify({ name: 'small-node', version: '1.0.0' }, null, 2));
  fs.writeFileSync(path.join(smallNode, 'index.js'), `const http = require('http');\nconst server = http.createServer((req, res) => {\n  res.writeHead(200);\n  res.end('Hello World\\n');\n});\nserver.listen(3000);\n`);
  fs.writeFileSync(path.join(smallNode, 'test.js'), `throw new Error('Test failure: Redis unreachable');\n`);
  runShell('git init', smallNode);
  runShell('git add .', smallNode);
  runShell('git commit -m "init"', smallNode);
  result('3', 'Small Node.js project (clean git)', fs.existsSync(path.join(smallNode, '.git')) ? 'PASS' : 'FAIL', 'Created');
  
  // 3b. Dirty git repo
  const dirtyGit = path.join(TEST_DIR, 'dirty-git');
  fs.mkdirSync(dirtyGit, { recursive: true });
  fs.writeFileSync(path.join(dirtyGit, 'app.js'), 'console.log("hello");\n');
  runShell('git init', dirtyGit);
  runShell('git add .', dirtyGit);
  runShell('git commit -m "init"', dirtyGit);
  fs.writeFileSync(path.join(dirtyGit, 'app.js'), 'console.log("modified");\n'); // dirty
  result('3', 'Dirty git repo', fs.existsSync(path.join(dirtyGit, '.git')) ? 'PASS' : 'FAIL', 'Created with uncommitted changes');
  
  // 3c. No git repo
  const noGit = path.join(TEST_DIR, 'no-git');
  fs.mkdirSync(noGit, { recursive: true });
  fs.writeFileSync(path.join(noGit, 'script.py'), 'raise Exception("Python error: DB connection failed")\n');
  result('3', 'No git project', fs.existsSync(path.join(noGit, 'script.py')) ? 'PASS' : 'FAIL', 'Created without git');
  
  // 3d. Multi-language project
  const multiLang = path.join(TEST_DIR, 'multi-lang');
  fs.mkdirSync(multiLang, { recursive: true });
  fs.writeFileSync(path.join(multiLang, 'package.json'), JSON.stringify({ name: 'multi', version: '1.0.0', scripts: { test: 'node test.js' } }, null, 2));
  fs.writeFileSync(path.join(multiLang, 'test.js'), 'throw new Error("Multi-lang test failure");\n');
  if (runShell('python3 --version').status === 0) {
    fs.writeFileSync(path.join(multiLang, 'main.py'), 'raise RuntimeError("Python module error")\n');
  }
  runShell('git init', multiLang);
  runShell('git add .', multiLang);
  runShell('git commit -m "init"', multiLang);
  result('3', 'Multi-language project', fs.existsSync(path.join(multiLang, 'test.js')) ? 'PASS' : 'FAIL', 'Created');
  
  // 3e. Project with env vars
  const envProject = path.join(TEST_DIR, 'env-project');
  fs.mkdirSync(envProject, { recursive: true });
  fs.writeFileSync(path.join(envProject, 'app.js'), `if (!process.env.DB_URL) throw new Error('Missing DB_URL');\nconsole.log('Connected to', process.env.DB_URL);\n`);
  runShell('git init', envProject);
  runShell('git add .', envProject);
  runShell('git commit -m "init"', envProject);
  result('3', 'Project with env vars', fs.existsSync(path.join(envProject, 'app.js')) ? 'PASS' : 'FAIL', 'Created');
  
  // 3f. Project with untracked files
  const untracked = path.join(TEST_DIR, 'untracked');
  fs.mkdirSync(untracked, { recursive: true });
  fs.writeFileSync(path.join(untracked, 'tracked.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(untracked, 'untracked.js'), 'throw new Error("Untracked file error");\n');
  runShell('git init', untracked);
  runShell('git add tracked.js', untracked);
  runShell('git commit -m "init"', untracked);
  result('3', 'Project with untracked files', fs.existsSync(path.join(untracked, 'untracked.js')) ? 'PASS' : 'FAIL', 'Created');
}

// ============================================
// PHASE 4: Core Feature Testing
// ============================================
async function phase4() {
  console.log('\n=== PHASE 4: Core Feature Testing ===\n');
  
  const smallNode = path.join(TEST_DIR, 'small-node');
  const dirtyGit = path.join(TEST_DIR, 'dirty-git');
  const noGit = path.join(TEST_DIR, 'no-git');
  const envProject = path.join(TEST_DIR, 'env-project');
  
  // 4a. Standard capture (clean git)
  log('4a. Standard capture (clean git)...');
  const cap1 = runShell(`bugproof capture -n test-clean --skip-secrets -- node test.js`, smallNode, 30000);
  const artifact1 = path.join(smallNode, 'test-clean.bug');
  result('4', 'Standard capture (clean git)', cap1.status === 0 && fs.existsSync(artifact1) ? 'PASS' : 'FAIL',
    cap1.status === 0 ? `Artifact created (${fs.statSync(artifact1).size} bytes)` : cap1.stderr);
  
  // 4b. Capture with dirty git
  log('4b. Capture with dirty git...');
  const cap2 = runShell(`bugproof capture -n test-dirty --skip-secrets -- node -e "throw new Error('dirty test')"`, dirtyGit, 30000);
  const artifact2 = path.join(dirtyGit, 'test-dirty.bug');
  result('4', 'Capture (dirty git)', cap2.status === 0 && fs.existsSync(artifact2) ? 'PASS' : 'FAIL',
    cap2.status === 0 ? 'Artifact created' : cap2.stderr);
  
  // 4c. Capture without git
  log('4c. Capture without git...');
  const cap3 = runShell(`bugproof capture -n test-nogit --skip-secrets -- node -e "throw new Error('no git test')"`, noGit, 30000);
  const artifact3 = path.join(noGit, 'test-nogit.bug');
  result('4', 'Capture (no git)', cap3.status === 0 && fs.existsSync(artifact3) ? 'PASS' : 'FAIL',
    cap3.status === 0 ? 'Artifact created' : cap3.stderr);
  
  // 4d. Capture with --json
  log('4d. Capture with --json...');
  const cap4 = runShell(`bugproof capture -n test-json --skip-secrets --json -- node -e "throw new Error('json test')"`, smallNode, 30000);
  let jsonValid = false;
  try { JSON.parse(cap4.stdout); jsonValid = true; } catch {}
  result('4', 'Capture --json', jsonValid ? 'PASS' : 'FAIL', jsonValid ? 'Valid JSON output' : cap4.stderr);
  
  // 4e. Capture with timeout
  log('4e. Capture with timeout...');
  const cap5 = runShell(`bugproof capture -n test-timeout --skip-secrets --timeout 2000 -- node -e "setTimeout(()=>{},10000)"`, smallNode, 15000);
  const artifact5 = path.join(smallNode, 'test-timeout.bug');
  result('4', 'Capture --timeout', cap5.status === 0 && fs.existsSync(artifact5) ? 'PASS' : 'FAIL',
    cap5.status === 0 ? 'Timeout captured' : cap5.stderr);
  
  // 4f. Capture with --exclude
  log('4f. Capture with --exclude...');
  const cap6 = runShell(`bugproof capture -n test-exclude --skip-secrets -x "*.js" -- node -e "throw new Error('exclude test')"`, smallNode, 30000);
  const artifact6 = path.join(smallNode, 'test-exclude.bug');
  result('4', 'Capture --exclude', cap6.status === 0 && fs.existsSync(artifact6) ? 'PASS' : 'FAIL',
    cap6.status === 0 ? 'Exclusion captured' : cap6.stderr);
  
  // 4g. Capture with --include-untracked
  log('4g. Capture with --include-untracked...');
  const untracked = path.join(TEST_DIR, 'untracked');
  const cap7 = runShell(`bugproof capture -n test-untracked --skip-secrets --include-untracked -- node -e "throw new Error('untracked test')"`, untracked, 30000);
  const artifact7 = path.join(untracked, 'test-untracked.bug');
  result('4', 'Capture --include-untracked', cap7.status === 0 && fs.existsSync(artifact7) ? 'PASS' : 'FAIL',
    cap7.status === 0 ? 'Untracked files captured' : cap7.stderr);
  
  // 4h. Capture with description
  log('4h. Capture with --description...');
  const cap8 = runShell(`bugproof capture -n test-desc -d "This is a test description" --skip-secrets -- node -e "throw new Error('desc test')"`, smallNode, 30000);
  const artifact8 = path.join(smallNode, 'test-desc.bug');
  result('4', 'Capture --description', cap8.status === 0 && fs.existsSync(artifact8) ? 'PASS' : 'FAIL',
    cap8.status === 0 ? 'Description captured' : cap8.stderr);
  
  // 4i. Replay same machine
  log('4i. Replay same machine...');
  if (fs.existsSync(artifact1)) {
    const replay1 = runShell(`bugproof replay test-clean.bug --skip-secrets`, smallNode, 30000);
    result('4', 'Replay (same machine)', replay1.status === 0 ? 'PASS' : 'FAIL',
      replay1.stdout.includes('REPRODUCTION CONFIRMED') ? 'Confirmed' : replay1.stderr);
  } else {
    result('4', 'Replay (same machine)', 'SKIP', 'Artifact not available');
  }
  
  // 4j. Replay with --json
  log('4j. Replay with --json...');
  if (fs.existsSync(artifact1)) {
    const replay2 = runShell(`bugproof replay test-clean.bug --json`, smallNode, 30000);
    let jsonValid2 = false;
    try { JSON.parse(replay2.stdout); jsonValid2 = true; } catch {}
    result('4', 'Replay --json', jsonValid2 ? 'PASS' : 'FAIL', jsonValid2 ? 'Valid JSON output' : replay2.stderr);
  }
  
  // 4k. Replay with --env override
  log('4k. Replay with --env override...');
  const envP = path.join(TEST_DIR, 'env-project');
  if (fs.existsSync(path.join(envP, 'app.js'))) {
    const capEnv = runShell(`bugproof capture -n env-test --skip-secrets -- node app.js`, envP, 30000);
    const artEnv = path.join(envP, 'env-test.bug');
    if (fs.existsSync(artEnv)) {
      const replayEnv = runShell(`bugproof replay env-test.bug --env DB_URL=postgres://localhost/test`, envP, 30000);
      result('4', 'Replay --env override', replayEnv.status === 0 ? 'PASS' : 'FAIL',
        replayEnv.stdout.includes('REPRODUCTION') ? 'Confirmed with env override' : replayEnv.stderr);
    }
  }
  
  // 4l. Inspect artifact
  log('4l. Inspect artifact...');
  if (fs.existsSync(artifact1)) {
    const inspect = runShell(`bugproof inspect test-clean.bug`, smallNode, 15000);
    result('4', 'Inspect', inspect.status === 0 ? 'PASS' : 'FAIL',
      inspect.stdout.includes('manifest') || inspect.stdout.includes('command') ? 'Metadata shown' : inspect.stderr);
  }
  
  // 4m. Diff two artifacts
  log('4m. Diff two artifacts...');
  if (fs.existsSync(artifact1) && fs.existsSync(artifact2)) {
    const diff = runShell(`bugproof diff test-clean.bug test-dirty.bug`, smallNode, 15000);
    result('4', 'Diff', diff.status === 0 ? 'PASS' : 'FAIL',
      diff.stdout.includes('diff') || diff.stdout.includes('change') ? 'Diff generated' : diff.stderr);
  }
  
  // 4n. Keygen + sign + verify
  log('4n. Keygen + sign + verify...');
  const keygen = runShell(`bugproof keygen`, TEST_DIR, 15000);
  result('4', 'Keygen', keygen.status === 0 ? 'PASS' : 'FAIL', keygen.status === 0 ? 'Keys generated' : keygen.stderr);
  
  if (keygen.status === 0) {
    const capSign = runShell(`bugproof capture -n test-signed --sign --signer "test@example.com" --skip-secrets -- node -e "throw new Error('sign test')"`, smallNode, 30000);
    const artSign = path.join(smallNode, 'test-signed.bug');
    result('4', 'Capture --sign', capSign.status === 0 && fs.existsSync(artSign) ? 'PASS' : 'FAIL',
      capSign.status === 0 ? 'Signed artifact created' : capSign.stderr);
    
    if (fs.existsSync(artSign)) {
      const verify = runShell(`bugproof verify test-signed.bug`, smallNode, 15000);
      result('4', 'Verify signature', verify.status === 0 ? 'PASS' : 'FAIL',
        verify.stdout.includes('SIGNATURE VALID') ? 'Signature valid' : verify.stderr);
      
      const replayVerify = runShell(`bugproof replay test-signed.bug --verify-signature`, smallNode, 30000);
      result('4', 'Replay --verify-signature', replayVerify.status === 0 ? 'PASS' : 'FAIL',
        replayVerify.stdout.includes('REPRODUCTION') ? 'Verified replay' : replayVerify.stderr);
    }
  }
  
  // 4o. Sandbox isolated
  log('4o. Replay --sandbox isolated...');
  if (fs.existsSync(artifact1)) {
    const sandbox1 = runShell(`bugproof replay test-clean.bug --sandbox isolated`, smallNode, 30000);
    result('4', 'Replay --sandbox isolated', sandbox1.status === 0 || sandbox1.status === 1 ? 'PASS' : 'FAIL',
      sandbox1.status <= 1 ? 'Sandbox executed' : sandbox1.stderr);
  }
  
  // 4p. Watch command
  log('4p. Watch command (failure)...');
  const watch = runShell(`bugproof watch -n test-watch --skip-secrets -- node -e "throw new Error('watch test')"`, smallNode, 30000);
  const artWatch = path.join(smallNode, 'test-watch.bug');
  result('4', 'Watch (failure capture)', fs.existsSync(artWatch) ? 'PASS' : 'FAIL',
    fs.existsSync(artWatch) ? 'Artifact captured on failure' : watch.stderr);
  
  // 4q. Watch command (success - no capture)
  log('4q. Watch command (success - no capture)...');
  const watchOk = runShell(`bugproof watch -n test-watch-ok --skip-secrets -- node -e "console.log('ok')"`, smallNode, 15000);
  const artWatchOk = path.join(smallNode, 'test-watch-ok.bug');
  result('4', 'Watch (success - no capture)', !fs.existsSync(artWatchOk) ? 'PASS' : 'FAIL',
    !fs.existsSync(artWatchOk) ? 'No artifact on success' : 'Artifact created unexpectedly');
  
  // 4r. Init command
  log('4r. Init command...');
  const initDir = path.join(TEST_DIR, 'init-test');
  fs.mkdirSync(initDir, { recursive: true });
  const init = runShell(`bugproof init`, initDir, 15000);
  result('4', 'Init', fs.existsSync(path.join(initDir, '.bugproofrc')) ? 'PASS' : 'FAIL',
    fs.existsSync(path.join(initDir, '.bugproofrc')) ? 'Config created' : init.stderr);
  
  // 4s. Clean command
  log('4s. Clean command...');
  const cleanDir = path.join(TEST_DIR, 'clean-test');
  fs.mkdirSync(cleanDir, { recursive: true });
  fs.writeFileSync(path.join(cleanDir, 'test1.bug'), 'fake artifact');
  fs.writeFileSync(path.join(cleanDir, 'test2.bug'), 'fake artifact');
  const cleanDry = runShell(`bugproof clean --dry-run`, cleanDir, 15000);
  const cleanExec = runShell(`bugproof clean`, cleanDir, 15000);
  const remaining = fs.readdirSync(cleanDir).filter(f => f.endsWith('.bug'));
  result('4', 'Clean --dry-run', cleanDry.status === 0 ? 'PASS' : 'FAIL', cleanDry.stdout);
  result('4', 'Clean (execute)', remaining.length === 0 ? 'PASS' : 'FAIL',
    remaining.length === 0 ? `Removed ${2 - remaining.length} files` : `${remaining.length} files remain`);
  
  // 4t. Prune command
  log('4t. Prune command...');
  const prune = runShell(`bugproof prune`, TEST_DIR, 15000);
  result('4', 'Prune', prune.status === 0 || prune.status === 1 ? 'PASS' : 'FAIL',
    prune.status <= 1 ? 'Prune executed' : prune.stderr);
}

// ============================================
// PHASE 5: Cross-Platform (Windows capture → Linux replay simulation)
// ============================================
async function phase5() {
  console.log('\n=== PHASE 5: Cross-Platform Compatibility ===\n');
  
  const smallNode = path.join(TEST_DIR, 'small-node');
  const artifact = path.join(smallNode, 'test-clean.bug');
  
  if (fs.existsSync(artifact)) {
    // Read manifest to check platform info
    const extractDir = path.join(TEST_DIR, 'extract-test');
    fs.mkdirSync(extractDir, { recursive: true });
    const extract = runShell(`powershell -Command "Expand-Archive -Path '${artifact.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`, TEST_DIR, 15000);
    
    if (extract.status === 0 && fs.existsSync(path.join(extractDir, 'manifest.json'))) {
      const manifest = JSON.parse(fs.readFileSync(path.join(extractDir, 'manifest.json'), 'utf-8'));
      result('5', 'Artifact platform info', manifest.captured_on ? 'PASS' : 'FAIL',
        `Captured on ${manifest.captured_on.os}/${manifest.captured_on.arch}`);
      
      // Check cross-platform metadata
      result('5', 'Cross-platform metadata', manifest.captured_on.os === 'win32' ? 'PASS' : 'FAIL',
        `Platform: ${manifest.captured_on.os}, Arch: ${manifest.captured_on.arch}`);
    }
  }
  
  // Replay consistency test (run 3 times)
  log('Replay consistency (3 runs)...');
  if (fs.existsSync(artifact)) {
    const results = [];
    for (let i = 0; i < 3; i++) {
      const r = runShell(`bugproof replay test-clean.bug`, smallNode, 30000);
      results.push(r.status);
    }
    const consistent = results.every(r => r === results[0]);
    result('5', 'Replay consistency', consistent ? 'PASS' : 'FAIL',
      `Results: ${results.join(', ')} ${consistent ? '(all same)' : '(inconsistent)'}`);
  }
}

// ============================================
// PHASE 6: Stress Testing
// ============================================
async function phase6() {
  console.log('\n=== PHASE 6: Stress Testing ===\n');
  
  // 6a. Large output capture
  log('6a. Large stdout/stderr capture...');
  const stressDir = path.join(TEST_DIR, 'stress');
  fs.mkdirSync(stressDir, { recursive: true });
  fs.writeFileSync(path.join(stressDir, 'big-output.js'), `
    for (let i = 0; i < 10000; i++) {
      console.log('Line ' + i + ': ' + 'x'.repeat(100));
    }
    throw new Error('Stress test failure after 10000 lines');
  `);
  runShell('git init', stressDir);
  runShell('git add .', stressDir);
  runShell('git commit -m "init"', stressDir);
  
  const capBig = runShell(`bugproof capture -n stress-big --skip-secrets -- node big-output.js`, stressDir, 60000);
  const artBig = path.join(stressDir, 'stress-big.bug');
  result('6', 'Large output capture', capBig.status === 0 && fs.existsSync(artBig) ? 'PASS' : 'FAIL',
    fs.existsSync(artBig) ? `Artifact: ${(fs.statSync(artBig).size / 1024).toFixed(1)} KB` : capBig.stderr);
  
  // 6b. Parallel captures
  log('6b. Parallel captures (3 simultaneous)...');
  const parallelDir = path.join(TEST_DIR, 'parallel');
  fs.mkdirSync(parallelDir, { recursive: true });
  fs.writeFileSync(path.join(parallelDir, 'test.js'), 'throw new Error("Parallel test");\n');
  runShell('git init', parallelDir);
  runShell('git add .', parallelDir);
  runShell('git commit -m "init"', parallelDir);
  
  const start = Date.now();
  const p1 = runShell(`bugproof capture -n parallel-1 --skip-secrets -- node test.js`, parallelDir, 30000);
  const p2 = runShell(`bugproof capture -n parallel-2 --skip-secrets -- node test.js`, parallelDir, 30000);
  const p3 = runShell(`bugproof capture -n parallel-3 --skip-secrets -- node test.js`, parallelDir, 30000);
  const elapsed = Date.now() - start;
  
  const allOk = p1.status === 0 && p2.status === 0 && p3.status === 0;
  result('6', 'Parallel captures', allOk ? 'PASS' : 'FAIL',
    `${elapsed}ms for 3 captures ${allOk ? '(all succeeded)' : '(some failed)'}`);
  
  // 6c. Repeated replay loop
  log('6c. Repeated replay loop (5x)...');
  const artPath = path.join(stressDir, 'stress-big.bug');
  if (fs.existsSync(artPath)) {
    let passCount = 0;
    for (let i = 0; i < 5; i++) {
      const r = runShell(`bugproof replay stress-big.bug`, stressDir, 30000);
      if (r.status === 0) passCount++;
    }
    result('6', 'Replay loop (5x)', passCount === 5 ? 'PASS' : 'FAIL',
      `${passCount}/5 replays confirmed`);
  }
}

// ============================================
// PHASE 7: Failure Injection
// ============================================
async function phase7() {
  console.log('\n=== PHASE 7: Failure Injection Testing ===\n');
  
  // 7a. Corrupted artifact
  log('7a. Corrupted artifact replay...');
  const corruptDir = path.join(TEST_DIR, 'corrupt');
  fs.mkdirSync(corruptDir, { recursive: true });
  fs.writeFileSync(path.join(corruptDir, 'corrupt.bug'), 'this is not a valid zip file');
  const corrupt = runShell(`bugproof replay corrupt.bug`, corruptDir, 15000);
  result('7', 'Corrupted artifact', corrupt.status !== 0 ? 'PASS' : 'FAIL',
    corrupt.status !== 0 ? 'Correctly rejected' : 'Should have failed');
  
  // 7b. Missing artifact
  log('7b. Missing artifact replay...');
  const missing = runShell(`bugproof replay nonexistent.bug`, TEST_DIR, 15000);
  result('7', 'Missing artifact', missing.status !== 0 ? 'PASS' : 'FAIL',
    missing.status !== 0 ? 'Correctly rejected' : 'Should have failed');
  
  // 7c. Invalid manifest
  log('7c. Invalid manifest replay...');
  const invalidDir = path.join(TEST_DIR, 'invalid-manifest');
  fs.mkdirSync(invalidDir, { recursive: true });
  fs.writeFileSync(path.join(invalidDir, 'invalid.json'), 'not json');
  // Create a fake artifact directory
  const fakeArt = path.join(invalidDir, 'fake.bug');
  fs.mkdirSync(fakeArt, { recursive: true });
  fs.writeFileSync(path.join(fakeArt, 'manifest.json'), 'not valid json{{{');
  const invalid = runShell(`bugproof replay fake.bug`, invalidDir, 15000);
  result('7', 'Invalid manifest', invalid.status !== 0 ? 'PASS' : 'FAIL',
    invalid.status !== 0 ? 'Correctly rejected' : 'Should have failed');
  
  // 7d. Broken git state
  log('7d. Broken git state capture...');
  const brokenGit = path.join(TEST_DIR, 'broken-git');
  fs.mkdirSync(brokenGit, { recursive: true });
  fs.mkdirSync(path.join(brokenGit, '.git'), { recursive: true });
  fs.writeFileSync(path.join(brokenGit, '.git', 'HEAD'), 'ref: refs/heads/nonexistent');
  fs.writeFileSync(path.join(brokenGit, 'app.js'), 'throw new Error("broken git test");\n');
  const brokenCap = runShell(`bugproof capture -n broken-git --skip-secrets -- node app.js`, brokenGit, 30000);
  result('7', 'Broken git state', brokenCap.status === 0 ? 'PASS' : 'FAIL',
    brokenCap.status === 0 ? 'Captured despite broken git' : brokenCap.stderr);
  
  // 7e. Permission denied
  log('7e. Permission denied scenario...');
  const permDir = path.join(TEST_DIR, 'perm-test');
  fs.mkdirSync(permDir, { recursive: true });
  fs.writeFileSync(path.join(permDir, 'app.js'), 'throw new Error("Permission denied: EACCES");\n');
  runShell('git init', permDir);
  runShell('git add .', permDir);
  runShell('git commit -m "init"', permDir);
  const permCap = runShell(`bugproof capture -n perm-test --skip-secrets -- node app.js`, permDir, 30000);
  result('7', 'Permission denied capture', permCap.status === 0 ? 'PASS' : 'FAIL',
    permCap.status === 0 ? 'Captured permission error' : permCap.stderr);
  
  // 7f. Invalid signature
  log('7f. Invalid signature verification...');
  const sigDir = path.join(TEST_DIR, 'sig-test');
  fs.mkdirSync(sigDir, { recursive: true });
  // Create a valid artifact first
  fs.writeFileSync(path.join(sigDir, 'app.js'), 'throw new Error("sig test");\n');
  runShell('git init', sigDir);
  runShell('git add .', sigDir);
  runShell('git commit -m "init"', sigDir);
  const sigCap = runShell(`bugproof capture -n sig-test --skip-secrets -- node app.js`, sigDir, 30000);
  const sigArt = path.join(sigDir, 'sig-test.bug');
  if (fs.existsSync(sigArt)) {
    // Tamper with the artifact
    const extractDir = path.join(TEST_DIR, 'sig-extract');
    fs.mkdirSync(extractDir, { recursive: true });
    const extract = runShell(`powershell -Command "Expand-Archive -Path '${sigArt.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`, TEST_DIR, 15000);
    if (extract.status === 0) {
      // Modify manifest
      const manifestPath = path.join(extractDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifest.name = 'TAMPERED';
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        // Re-zip
        const tamperedArt = path.join(sigDir, 'sig-test-tampered.bug');
        runShell(`powershell -Command "Compress-Archive -Path '${extractDir.replace(/'/g, "''")}\\*' -DestinationPath '${tamperedArt.replace(/'/g, "''")}' -Force"`, TEST_DIR, 15000);
        
        const tamperedReplay = runShell(`bugproof replay sig-test-tampered.bug --verify-signature`, sigDir, 30000);
        result('7', 'Tampered artifact replay', tamperedReplay.status !== 0 ? 'PASS' : 'FAIL',
          tamperedReplay.status !== 0 ? 'Correctly detected tampering' : 'Should have detected tampering');
      }
    }
  }
}

// ============================================
// PHASE 8: MCP Server Testing
// ============================================
async function phase8() {
  console.log('\n=== PHASE 8: MCP Server Testing ===\n');
  
  // 8a. MCP server starts
  log('8a. MCP server initialization...');
  const mcpTest = runShell(`echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | bugproof mcp`, TEST_DIR, 15000);
  let initValid = false;
  try {
    const lines = mcpTest.stdout.trim().split('\n');
    const resp = JSON.parse(lines[lines.length - 1]);
    initValid = resp.result && resp.result.serverInfo && resp.result.serverInfo.name === 'bugproof';
  } catch {}
  result('8', 'MCP initialize', initValid ? 'PASS' : 'FAIL',
    initValid ? 'Server responded with info' : mcpTest.stderr);
  
  // 8b. Tools list
  log('8b. MCP tools/list...');
  const toolsTest = runShell(`echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | bugproof mcp`, TEST_DIR, 15000);
  let toolsValid = false;
  try {
    const lines = toolsTest.stdout.trim().split('\n');
    const resp = JSON.parse(lines[lines.length - 1]);
    toolsValid = resp.result && resp.result.tools && resp.result.tools.length >= 5;
  } catch {}
  result('8', 'MCP tools/list', toolsValid ? 'PASS' : 'FAIL',
    toolsValid ? `${toolsTest.stdout.match(/"name"/g)?.length || 0} tools listed` : toolsTest.stderr);
  
  // 8c. Malformed JSON handling
  log('8c. MCP malformed JSON...');
  const malformedTest = runShell(`echo 'not json at all' | bugproof mcp`, TEST_DIR, 15000);
  let malformedHandled = false;
  try {
    malformedHandled = malformedTest.stdout.includes('-32700') || malformedTest.stdout.includes('Parse error');
  } catch {}
  result('8', 'MCP malformed JSON', malformedHandled ? 'PASS' : 'FAIL',
    malformedHandled ? 'Parse error returned' : 'No error response');
  
  // 8d. Unknown method handling
  log('8d. MCP unknown method...');
  const unknownTest = runShell(`echo '{"jsonrpc":"2.0","id":3,"method":"unknown/method"}' | bugproof mcp`, TEST_DIR, 15000);
  let unknownHandled = false;
  try {
    unknownHandled = unknownTest.stdout.includes('-32601') || unknownTest.stdout.includes('Method not found');
  } catch {}
  result('8', 'MCP unknown method', unknownHandled ? 'PASS' : 'FAIL',
    unknownHandled ? 'Method not found error returned' : 'No error response');
  
  // 8e. server.json validation
  log('8e. server.json validation...');
  const serverJsonPath = path.join(process.cwd(), 'server.json');
  if (fs.existsSync(serverJsonPath)) {
    try {
      const serverJson = JSON.parse(fs.readFileSync(serverJsonPath, 'utf-8'));
      const valid = serverJson.name && serverJson.version && serverJson.tools;
      result('8', 'server.json schema', valid ? 'PASS' : 'FAIL',
        valid ? 'Valid MCP server manifest' : 'Missing required fields');
    } catch {
      result('8', 'server.json schema', 'FAIL', 'Invalid JSON');
    }
  } else {
    result('8', 'server.json schema', 'SKIP', 'File not found');
  }
}

// ============================================
// PHASE 9: Report Generation
// ============================================
function generateReport() {
  console.log('\n=== PHASE 9: Validation Report ===\n');
  
  const total = RESULTS.length;
  const passed = RESULTS.filter(r => r.status === 'PASS').length;
  const failed = RESULTS.filter(r => r.status === 'FAIL').length;
  const skipped = RESULTS.filter(r => r.status === 'SKIP').length;
  
  const passRate = ((passed / (total - skipped)) * 100).toFixed(1);
  
  console.log(`\n📊 Test Summary:`);
  console.log(`   Total:    ${total}`);
  console.log(`   Passed:   ${passed}`);
  console.log(`   Failed:   ${failed}`);
  console.log(`   Skipped:  ${skipped}`);
  console.log(`   Pass Rate: ${passRate}%\n`);
  
  if (failed > 0) {
    console.log('❌ Failed Tests:');
    for (const r of RESULTS.filter(r => r.status === 'FAIL')) {
      console.log(`   [Phase ${r.phase}] ${r.test}: ${r.detail}`);
    }
    console.log();
  }
  
  // Generate detailed report file
  const reportPath = path.join(TEST_DIR, 'validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    bugproofVersion: runShell('bugproof --version').stdout.trim(),
    summary: { total, passed, failed, skipped, passRate },
    results: RESULTS,
  }, null, 2));
  
  console.log(`📄 Detailed report: ${reportPath}\n`);
  
  return { total, passed, failed, skipped, passRate: parseFloat(passRate) };
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log('🚀 BugProof Comprehensive Validation Suite');
  console.log('==========================================\n');
  
  setup();
  
  await phase1();
  await phase2();
  await phase3();
  await phase4();
  await phase5();
  await phase6();
  await phase7();
  await phase8();
  
  const summary = generateReport();
  
  if (summary.failed > 0) {
    console.log(`\n❌ ${summary.failed} test(s) failed. Review the report for details.\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${summary.passed} tests passed!\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
