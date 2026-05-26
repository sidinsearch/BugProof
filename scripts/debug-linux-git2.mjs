import { NodeSSH } from 'node-ssh';
const ssh = new NodeSSH();
async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });

  const testDir = '/tmp/git-debug';
  await ssh.execCommand('rm -rf ' + testDir + ' && mkdir -p ' + testDir);
  await ssh.execCommand('cd ' + testDir + ' && git init -q && git config user.email "test@test.com" && git config user.name "Test"');

  // Commit 1
  await ssh.execCommand("cd " + testDir + " && cat > app.js << 'EOF'\nconsole.log('v1');\nthrow new Error('Bug v1');\nEOF");
  await ssh.execCommand('cd ' + testDir + ' && git add . && git commit -q -m "v1"');

  // Capture
  const cap = await ssh.execCommand('cd ' + testDir + ' && export PATH=~/.npm-global/bin:$PATH && bugproof capture --skip-secrets -n bug1 -- node app.js 2>&1');
  console.log('Capture:', cap.stdout.slice(-200));

  const bugFile = (await ssh.execCommand('cd ' + testDir + ' && ls *.bug')).stdout.trim();
  console.log('Bug:', bugFile);

  // Commit 2
  await ssh.execCommand("cd " + testDir + " && cat > app.js << 'EOF'\nconsole.log('v2 - fixed');\nEOF");
  await ssh.execCommand('cd ' + testDir + ' && git add . && git commit -q -m "v2"');

  // Replay current mode
  console.log('\n=== Replay current mode ===');
  const replay = await ssh.execCommand('cd ' + testDir + ' && export PATH=~/.npm-global/bin:$PATH && bugproof replay ' + bugFile + ' --version-match current 2>&1');
  console.log(replay.stdout);

  ssh.dispose();
}
main().catch(e => { console.error(e.message); process.exit(1); });
