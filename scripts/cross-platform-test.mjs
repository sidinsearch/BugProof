// Cross-platform test orchestrator
import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ssh = new NodeSSH();
const LINUX_HOST = '192.168.31.49';
const LINUX_USER = 'siddharth';
const LINUX_PASS = 'Darknight';
const REMOTE_DIR = '/home/siddharth/dummy-test';
const BUGPROOF_BIN = 'bugproof'; // Already installed globally on Linux

const results = { winWin: [], linuxLinux: [], winLinux: [], linuxWin: [] };

async function connect() {
  console.log('Connecting to Linux...');
  await ssh.connect({ host: LINUX_HOST, username: LINUX_USER, password: LINUX_PASS, readyTimeout: 30000 });
  console.log('Connected!');
}

async function exec(cmd) {
  const result = await ssh.execCommand(cmd);
  if (result.code !== 0 && result.stderr) {
    console.error(`  stderr: ${result.stderr.slice(0, 200)}`);
  }
  return result;
}

async function setupLinux() {
  console.log('\n=== Setting up Linux environment ===');
  await exec(`rm -rf ${REMOTE_DIR} && mkdir -p ${REMOTE_DIR}`);
  console.log('Cleaned remote directory');
}

async function syncProject(localName) {
  const localPath = `D:\\Dummy\\${localName}`;
  if (!fs.existsSync(localPath)) {
    console.log(`  Skipping ${localName} (not found)`);
    return false;
  }

  // Create tarball locally
  const tarPath = `D:\\BugProof\\scripts\\${localName}.tar.gz`;
  try {
    execSync(`tar -czf "${tarPath}" -C "D:\\Dummy" "${localName}"`, { stdio: 'pipe' });
  } catch {
    // Windows tar might not work, use 7z or skip
    console.log(`  Could not tar ${localName}, skipping`);
    return false;
  }

  // Upload via SFTP
  await ssh.putFile(tarPath, `/tmp/${localName}.tar.gz`);
  await exec(`cd ${REMOTE_DIR} && tar xzf /tmp/${localName}.tar.gz && rm /tmp/${localName}.tar.gz`);
  fs.unlinkSync(tarPath);
  console.log(`  Synced: ${localName}`);
  return true;
}

async function runLinuxCapture(name, cmd) {
  const result = await exec(`cd ${REMOTE_DIR}/${name} && rm -f *.bug && ${BUGPROOF_BIN} capture --skip-secrets -n ${name} -- ${cmd}`);
  const bugCheck = await exec(`cd ${REMOTE_DIR}/${name} && ls *.bug 2>/dev/null || echo "NO_BUG"`);
  if (bugCheck.stdout.includes('.bug')) {
    const bugFile = bugCheck.stdout.trim().split('\n').pop();
    const replay = await exec(`cd ${REMOTE_DIR}/${name} && ${BUGPROOF_BIN} replay ${bugFile}`);
    const confirmed = replay.stdout.includes('REPRODUCTION CONFIRMED') || replay.stdout.includes('Reproduction confirmed');
    return { captured: true, replayed: confirmed, name };
  }
  return { captured: false, replayed: false, name };
}

async function runCrossPlatformWinToLinux(name, cmd) {
  // Capture on Windows
  const localPath = `D:\\Dummy\\${name}`;
  process.chdir(localPath);
  // Clean old bugs using fs
  for (const f of fs.readdirSync(localPath)) {
    if (f.endsWith('.bug')) fs.unlinkSync(path.join(localPath, f));
  }
  try {
    execSync(`node D:\\BugProof\\dist\\cli.js capture --skip-secrets -n ${name} -- ${cmd}`, { stdio: 'pipe' });
  } catch {
    // Capture exits non-zero on failure, which is expected
  }

  const bugFile = fs.readdirSync(localPath).find(f => f.endsWith('.bug'));
  if (!bugFile) return { captured: false, replayed: false, name, direction: 'win->linux' };

  // Upload to Linux
  await ssh.putFile(path.join(localPath, bugFile), `${REMOTE_DIR}/${name}/${bugFile}`);

  // Replay on Linux
  const replay = await exec(`cd ${REMOTE_DIR}/${name} && ${BUGPROOF_BIN} replay ${bugFile}`);
  const confirmed = replay.stdout.includes('REPRODUCTION CONFIRMED') || replay.stdout.includes('Reproduction confirmed');
  return { captured: true, replayed: confirmed, name, direction: 'win->linux' };
}

async function runTests() {
  const testCases = [
    { name: 'node-crash-error', cmd: 'node index.js' },
    { name: 'node-syntax-error', cmd: 'node index.js' },
    { name: 'python-runtime-error', cmd: 'python main.py' },
    { name: 'python-div-zero', cmd: 'python main.py' },
    { name: 'java-exception', cmd: 'java Main.java' },
  ];

  // Linux-only tests
  console.log('\n=== Linux Capture + Replay ===');
  for (const tc of testCases) {
    await syncProject(tc.name);
    const result = await runLinuxCapture(tc.name, tc.cmd);
    results.linuxLinux.push(result);
    console.log(`  ${tc.name}: ${result.captured ? 'captured' : 'FAILED'} → ${result.replayed ? 'CONFIRMED' : 'NOT CONFIRMED'}`);
  }

  // Windows → Linux cross-platform
  console.log('\n=== Windows Capture → Linux Replay ===');
  for (const tc of testCases) {
    const result = await runCrossPlatformWinToLinux(tc.name, tc.cmd);
    results.winLinux.push(result);
    console.log(`  ${tc.name}: ${result.captured ? 'captured' : 'FAILED'} → ${result.replayed ? 'CONFIRMED' : 'NOT CONFIRMED'}`);
  }
}

async function printReport() {
  console.log('\n========================================');
  console.log('  CROSS-PLATFORM VALIDATION REPORT');
  console.log('========================================\n');

  console.log('Linux Capture + Replay:');
  results.linuxLinux.forEach(r => console.log(`  ${r.name}: ${r.replayed ? 'PASS' : 'FAIL'}`));
  const llPass = results.linuxLinux.filter(r => r.replayed).length;
  console.log(`  ${llPass}/${results.linuxLinux.length} passed\n`);

  console.log('Windows Capture → Linux Replay:');
  results.winLinux.forEach(r => console.log(`  ${r.name}: ${r.replayed ? 'PASS' : 'FAIL'}`));
  const wlPass = results.winLinux.filter(r => r.replayed).length;
  console.log(`  ${wlPass}/${results.winLinux.length} passed\n`);

  const total = results.linuxLinux.length + results.winLinux.length;
  const totalPass = llPass + wlPass;
  console.log(`TOTAL: ${totalPass}/${total} passed (${Math.round(totalPass/total*100)}%)\n`);
}

async function main() {
  try {
    await connect();
    await setupLinux();
    await runTests();
    await printReport();
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    ssh.dispose();
  }
}

main();
