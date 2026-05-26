// Debug Linux → Windows Python replay
import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ssh = new NodeSSH();

async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });

  const name = 'python-runtime-error';
  const winDir = `D:\\Dummy\\${name}\\linux-capture-debug`;
  if (!fs.existsSync(winDir)) fs.mkdirSync(winDir, { recursive: true });

  // Capture on Linux with python3 main.py
  await ssh.execCommand(`rm -rf /tmp/linux-capture && mkdir -p /tmp/linux-capture/${name}`);

  // Sync project
  const tarPath = `D:\\BugProof\\scripts\\${name}-src.tar.gz`;
  execSync(`tar -czf "${tarPath}" -C "D:\\Dummy" "${name}"`, { stdio: 'pipe' });
  await ssh.putFile(tarPath, `/tmp/${name}-src.tar.gz`);
  await ssh.execCommand(`cd /tmp && tar xzf ${name}-src.tar.gz && rm ${name}-src.tar.gz`);
  fs.unlinkSync(tarPath);

  // Capture on Linux
  const captureResult = await ssh.execCommand(`cd /tmp/${name} && rm -f *.bug && bugproof capture --skip-secrets -n ${name}-linux -- python3 main.py 2>&1 | tail -10`);
  console.log('Linux capture:', captureResult.stdout);

  const bugCheck = await ssh.execCommand(`cd /tmp/${name} && ls *.bug 2>/dev/null || echo "NO_BUG"`);
  const bugFile = bugCheck.stdout.trim().split('\n').pop();
  console.log('Bug file:', bugFile);

  // Download to Windows
  const winBugPath = path.join(winDir, bugFile);
  await ssh.getFile(winBugPath, `/tmp/${name}/${bugFile}`);
  console.log('Downloaded to Windows');

  // Extract and check contents
  const extractDir = path.join(winDir, 'extracted');
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`tar -xf "${winBugPath}" -C "${extractDir}"`);

  const manifest = JSON.parse(fs.readFileSync(path.join(extractDir, 'manifest.json'), 'utf-8'));
  const failure = JSON.parse(fs.readFileSync(path.join(extractDir, 'failure.json'), 'utf-8'));
  const runConfig = JSON.parse(fs.readFileSync(path.join(extractDir, 'run.json'), 'utf-8'));
  const filesJson = JSON.parse(fs.readFileSync(path.join(extractDir, 'files.json'), 'utf-8'));

  console.log('\nArtifact contents:');
  console.log(`  Command: ${JSON.stringify(manifest.command)}`);
  console.log(`  Captured on: ${manifest.captured_on.os}`);
  console.log(`  Error patterns: ${JSON.stringify(failure.error_patterns)}`);
  console.log(`  Run config command: ${JSON.stringify(runConfig.command)}`);
  console.log(`  Files: ${filesJson.map(f => f.path).join(', ')}`);

  // Replay on Windows
  console.log('\nReplaying on Windows...');
  process.chdir(winDir);
  try {
    const replayOut = execSync(`node D:\\BugProof\\dist\\cli.js replay ${bugFile}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(replayOut);
  } catch (e) {
    console.log(e.stdout || e.stderr || '');
  }

  ssh.dispose();
}

main().catch(e => { console.error(e.message); process.exit(1); });
