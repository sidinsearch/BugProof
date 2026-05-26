import { NodeSSH } from 'node-ssh';
const ssh = new NodeSSH();
async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });
  const r1 = await ssh.execCommand('which bugproof && bugproof --version');
  console.log('Global bugproof:', r1.stdout);
  const r2 = await ssh.execCommand('export PATH=~/.npm-global/bin:$PATH && which bugproof && bugproof --version');
  console.log('npm-global bugproof:', r2.stdout);
  const r3 = await ssh.execCommand('ls -la /usr/bin/bugproof 2>/dev/null || echo "not in /usr/bin"');
  console.log('/usr/bin/bugproof:', r3.stdout);
  const r4 = await ssh.execCommand('ls -la ~/.npm-global/bin/bugproof 2>/dev/null || echo "not in npm-global"');
  console.log('~/.npm-global/bin/bugproof:', r4.stdout);
  ssh.dispose();
}
main().catch(e => { console.error(e.message); process.exit(1); });
