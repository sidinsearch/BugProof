import { NodeSSH } from 'node-ssh';
const ssh = new NodeSSH();
async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });
  // Clean up
  await ssh.execCommand('rm -rf /tmp/git-mismatch-test');
  console.log('Cleaned Linux test dir');
  ssh.dispose();
}
main().catch(e => { console.error(e.message); process.exit(1); });
