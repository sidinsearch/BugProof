// Linux → Windows cross-platform test
import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ssh = new NodeSSH();
const LINUX_HOST = '192.168.31.49';
const LINUX_USER = 'siddharth';
const LINUX_PASS = 'Darknight';
const REMOTE_DIR = '/home/siddharth/dummy-test';
const results = [];

async function connect() {
  console.log('Connecting to Linux...');
  await ssh.connect({ host: LINUX_HOST, username: LINUX_USER, password: LINUX_PASS, readyTimeout: 30000 });
  console.log('Connected!');
}

async function exec(cmd) {
  const result = await ssh.execCommand(cmd);
  return result;
}

async function runLinuxToWinTest(name, linuxCmd) {
  console.log(`\n--- Linux Capture → Windows Replay: ${name} ---`);

  // 1. Capture on Linux
  await exec(`rm -rf ${REMOTE_DIR} && mkdir -p ${REMOTE_DIR}/${name}`);

  // Sync project to Linux first
  const localPath = `D:\\Dummy\\${name}`;
  const tarPath = `D:\\BugProof\\scripts\\${name}.tar.gz`;
  try {
    execSync(`tar -czf "${tarPath}" -C "D:\\Dummy" "${name}"`, { stdio: 'pipe' });
    await ssh.putFile(tarPath, `/tmp/${name}.tar.gz`);
    await exec(`cd ${REMOTE_DIR} && tar xzf /tmp/${name}.tar.gz && rm /tmp/${name}.tar.gz`);
    fs.unlinkSync(tarPath);
  } catch (e) {
    console.log(`  Skip: could not sync ${name}`);
    return { name, captured: false, replayed: false, direction: 'linux->win' };
  }

  // Capture on Linux
  const captureResult = await exec(`cd ${REMOTE_DIR}/${name} && bugproof capture --skip-secrets -n ${name} -- ${linuxCmd}`);
  const bugCheck = await exec(`cd ${REMOTE_DIR}/${name} && ls *.bug 2>/dev/null || echo "NO_BUG"`);

  if (!bugCheck.stdout.includes('.bug')) {
    console.log(`  Linux capture FAILED`);
    return { name, captured: false, replayed: false, direction: 'linux->win' };
  }

  const bugFile = bugCheck.stdout.trim().split('\n').pop();
  console.log(`  Linux captured: ${bugFile}`);

  // Download to Windows
  const winDir = `D:\\Dummy\\${name}\\linux-capture`;
  if (!fs.existsSync(winDir)) fs.mkdirSync(winDir, { recursive: true });
  const winBugPath = path.join(winDir, bugFile);

  await ssh.getFile(winBugPath, `${REMOTE_DIR}/${name}/${bugFile}`);
  console.log(`  Downloaded to Windows`);

  // Replay on Windows
  process.chdir(winDir);
  try {
    const replayOut = execSync(`node D:\\BugProof\\dist\\cli.js replay ${bugFile}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const confirmed = replayOut.includes('REPRODUCTION CONFIRMED') || replayOut.includes('Reproduction confirmed');
    console.log(`  Windows replay: ${confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`);
    return { name, captured: true, replayed: confirmed, direction: 'linux->win' };
  } catch (e) {
    const output = e.stdout || e.stderr || '';
    const confirmed = output.includes('REPRODUCTION CONFIRMED') || output.includes('Reproduction confirmed');
    console.log(`  Windows replay: ${confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`);
    return { name, captured: true, replayed: confirmed, direction: 'linux->win' };
  }
}

async function main() {
  try {
    await connect();

    const testCases = [
      { name: 'node-crash-error', linuxCmd: 'node index.js' },
      { name: 'node-syntax-error', linuxCmd: 'node index.js' },
      { name: 'python-runtime-error', linuxCmd: 'python3 main.py' },
      { name: 'python-div-zero', linuxCmd: 'python3 main.py' },
      { name: 'java-exception', linuxCmd: 'java Main.java' },
    ];

    for (const tc of testCases) {
      const result = await runLinuxToWinTest(tc.name, tc.linuxCmd);
      results.push(result);
    }

    console.log('\n=== Linux → Windows Results ===');
    results.forEach(r => console.log(`  ${r.name}: ${r.replayed ? 'PASS' : 'FAIL'}`));
    const pass = results.filter(r => r.replayed).length;
    console.log(`\n${pass}/${results.length} passed`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    ssh.dispose();
  }
}

main();
