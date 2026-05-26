import { NodeSSH } from 'node-ssh';
const ssh = new NodeSSH();
async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });
  await ssh.execCommand('rm -rf /tmp/git-mismatch-test /tmp/linux-replay-test');
  console.log('Cleaned Linux test dirs');
  ssh.dispose();
}
main().catch(e => { console.error(e.message); process.exit(1); });
