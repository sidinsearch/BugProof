import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();
const LINUX_HOST = '192.168.31.49';
const LINUX_USER = 'siddharth';
const LINUX_PASS = 'Darknight';
const REMOTE_DIR = '/home/siddharth/bugproof-test';

async function run() {
  await ssh.connect({ host: LINUX_HOST, username: LINUX_USER, password: LINUX_PASS });
  const result = await ssh.execCommand(`cd ${REMOTE_DIR} && node -e "
const extract = require('extract-zip');
const fs = require('fs');
const path = require('path');
const os = require('os');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-extract-'));
console.log('Extracting to:', tempDir);
extract('windows.bug', { dir: tempDir }).then(() => {
  console.log('Extracted files:', fs.readdirSync(tempDir));
  console.log('files/ exists?', fs.existsSync(path.join(tempDir, 'files')));
}).catch(console.error);
"`);
  console.log("STDOUT:\n", result.stdout);
  console.log("STDERR:\n", result.stderr);
  ssh.dispose();
}
run();
