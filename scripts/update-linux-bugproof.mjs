import { NodeSSH } from 'node-ssh';
const ssh = new NodeSSH();
async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });
  console.log('Updating bugproof on Linux...');
  const r1 = await ssh.execCommand('export PATH=~/.npm-global/bin:$PATH && npm install -g bugproof@1.2.7 2>&1 | tail -3');
  console.log(r1.stdout);
  const r2 = await ssh.execCommand('export PATH=~/.npm-global/bin:$PATH && bugproof --version');
  console.log('Linux version:', r2.stdout.trim());
  ssh.dispose();
}
main().catch(e => { console.error(e.message); process.exit(1); });
