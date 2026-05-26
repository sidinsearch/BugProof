import { NodeSSH } from 'node-ssh';
const ssh = new NodeSSH();
async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });
  console.log('Forcing bugproof@1.2.6 install on Linux...');
  const r1 = await ssh.execCommand('npm install -g bugproof@1.2.6 --force 2>&1 | tail -3');
  console.log(r1.stdout);
  const r2 = await ssh.execCommand('bugproof --version');
  console.log('Version:', r2.stdout.trim());
  const r3 = await ssh.execCommand('cd /tmp/linux-test && bugproof replay linux-post-test.bug 2>&1 | grep -i "reproduction\|exit code\|verdict"');
  console.log('Replay:', r3.stdout);
  ssh.dispose();
}
main().catch(e => { console.error(e.message); process.exit(1); });
