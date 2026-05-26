// Quick SSH test script using node-ssh
import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function main() {
  console.log('Connecting to Linux...');
  await ssh.connect({
    host: '192.168.31.49',
    username: 'siddharth',
    password: 'Darknight',
    readyTimeout: 30000,
  });
  console.log('Connected!');

  const result = await ssh.execCommand('echo "=== Linux Env ===" && uname -a && node --version && python3 --version && git --version && gcc --version | head -1 && which bugproof || echo "bugproof not installed"');
  console.log(result.stdout);
  if (result.stderr) console.error('stderr:', result.stderr);

  ssh.dispose();
  console.log('Done');
}

main().catch(err => {
  console.error('SSH error:', err.message);
  process.exit(1);
});
