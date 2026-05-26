// Debug Linux git mismatch replay
import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ssh = new NodeSSH();

async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });

  const linuxTestDir = '/tmp/git-mismatch-test';
  await ssh.execCommand('rm -rf ' + linuxTestDir + ' && mkdir -p ' + linuxTestDir);
  await ssh.execCommand('cd ' + linuxTestDir + ' && git init -q && git config user.email "test@test.com" && git config user.name "Test"');

  // Commit 1: bug
  await ssh.execCommand("cd " + linuxTestDir + " && cat > app.js << 'EOF'\nconsole.log('v1 - starting');\nthrow new Error('Bug in v1');\nEOF");
  await ssh.execCommand('cd ' + linuxTestDir + ' && git add . && git commit -q -m "v1: initial"');

  // Capture
  const captureResult = await ssh.execCommand('cd ' + linuxTestDir + ' && export PATH=~/.npm-global/bin:$PATH && bugproof capture --skip-secrets -n v1-bug -- node app.js 2>&1');
  console.log('Capture output:');
  console.log(captureResult.stdout);

  const linuxBugFile = (await ssh.execCommand('cd ' + linuxTestDir + ' && ls *.bug 2>/dev/null')).stdout.trim();
  console.log('Bug file:', linuxBugFile);

  // Commit 2: fix
  await ssh.execCommand("cd " + linuxTestDir + " && cat > app.js << 'EOF'\nconsole.log('v2 - fixed');\nconsole.log('All good now');\nEOF");
  await ssh.execCommand('cd ' + linuxTestDir + ' && git add . && git commit -q -m "v2: fix bug"');

  // Replay with verbose output
  console.log('\n=== Replay (current mode) ===');
  const replayResult = await ssh.execCommand('cd ' + linuxTestDir + ' && export PATH=~/.npm-global/bin:$PATH && bugproof replay ' + linuxBugFile + ' --version-match current 2>&1');
  console.log(replayResult.stdout);
  if (replayResult.stderr) console.log('stderr:', replayResult.stderr);

  // Check artifact contents
  console.log('\n=== Artifact contents ===');
  await ssh.execCommand('cd ' + linuxTestDir + ' && rm -rf extracted && mkdir extracted && unzip -q ' + linuxBugFile + ' -d extracted 2>/dev/null || tar -xf ' + linuxBugFile + ' -C extracted');
  const manifestResult = await ssh.execCommand('cd ' + linuxTestDir + '/extracted && cat manifest.json');
  console.log('Manifest:', manifestResult.stdout);
  const failureResult = await ssh.execCommand('cd ' + linuxTestDir + '/extracted && cat failure.json');
  console.log('Failure:', failureResult.stdout);
  const filesResult = await ssh.execCommand('cd ' + linuxTestDir + '/extracted && cat files.json');
  console.log('Files:', filesResult.stdout);
  const lsResult = await ssh.execCommand('cd ' + linuxTestDir + '/extracted && find . -type f');
  console.log('All files:', lsResult.stdout);

  ssh.dispose();
}

main().catch(e => { console.error(e.message); process.exit(1); });
