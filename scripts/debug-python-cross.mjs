// Debug Python cross-platform replay
import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ssh = new NodeSSH();

async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });
  console.log('=== Debugging Python Win→Linux Cross-Platform ===\n');

  const name = 'python-runtime-error';
  const localPath = `D:\\Dummy\\${name}`;

  // Clean old bugs
  for (const f of fs.readdirSync(localPath)) {
    if (f.endsWith('.bug')) fs.unlinkSync(path.join(localPath, f));
  }

  // Capture on Windows
  console.log('1. Capturing on Windows...');
  try {
    execSync(`node D:\\BugProof\\dist\\cli.js capture --skip-secrets -n ${name} -- python app.py`, { cwd: localPath, stdio: 'pipe' });
  } catch {}

  const bugFile = fs.readdirSync(localPath).find(f => f.endsWith('.bug'));
  console.log(`   Captured: ${bugFile}`);

  // Read the artifact to see what's inside
  const extractDir = path.join(localPath, 'extracted');
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`tar -xf ${bugFile} -C ${extractDir}`, { cwd: localPath });

  const manifest = JSON.parse(fs.readFileSync(path.join(extractDir, 'manifest.json'), 'utf-8'));
  const failure = JSON.parse(fs.readFileSync(path.join(extractDir, 'failure.json'), 'utf-8'));
  const runConfig = JSON.parse(fs.readFileSync(path.join(extractDir, 'run.json'), 'utf-8'));

  console.log('\n2. Artifact contents:');
  console.log(`   Command: ${JSON.stringify(manifest.command)}`);
  console.log(`   Captured on: ${manifest.captured_on.os}`);
  console.log(`   Error patterns: ${JSON.stringify(failure.error_patterns)}`);
  console.log(`   Run config command: ${JSON.stringify(runConfig.command)}`);

  // Upload to Linux
  console.log('\n3. Uploading to Linux...');
  await ssh.execCommand(`rm -rf /tmp/debug-test && mkdir -p /tmp/debug-test/${name}`);
  await ssh.putFile(path.join(localPath, bugFile), `/tmp/debug-test/${name}/${bugFile}`);

  // Replay on Linux with verbose output
  console.log('\n4. Replaying on Linux...');
  const replayResult = await ssh.execCommand(`cd /tmp/debug-test/${name} && bugproof replay ${bugFile} 2>&1`);
  console.log('Replay output:');
  console.log(replayResult.stdout);
  if (replayResult.stderr) console.log('stderr:', replayResult.stderr);

  // Also try manual replay with python3
  console.log('\n5. Manual replay with python3...');
  const manualResult = await ssh.execCommand(`cd /tmp/debug-test/${name} && python3 app.py 2>&1`);
  console.log('Manual output:', manualResult.stdout);

  ssh.dispose();
}

main().catch(e => { console.error(e.message); process.exit(1); });
