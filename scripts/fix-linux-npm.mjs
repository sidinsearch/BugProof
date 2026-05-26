import { NodeSSH } from 'node-ssh';
const ssh = new NodeSSH();
async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });
  console.log('Fixing npm permissions and installing 1.2.6...');
  const r1 = await ssh.execCommand('mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global && echo "export PATH=~/.npm-global/bin:$PATH" >> ~/.bashrc && export PATH=~/.npm-global/bin:$PATH && npm install -g bugproof@1.2.6 2>&1 | tail -5');
  console.log(r1.stdout);
  const r2 = await ssh.execCommand('export PATH=~/.npm-global/bin:$PATH && bugproof --version');
  console.log('Version:', r2.stdout.trim());
  const r3 = await ssh.execCommand('export PATH=~/.npm-global/bin:$PATH && cd /tmp/linux-test && bugproof replay linux-post-test.bug 2>&1 | grep -i "reproduction\|exit code\|verdict"');
  console.log('Replay:', r3.stdout);
  ssh.dispose();
}
main().catch(e => { console.error(e.message); process.exit(1); });
