// Post-publish testing on Linux
import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function main() {
  console.log('=== Post-Publish Testing: Linux ===\n');

  console.log('1. Connecting to Linux...');
  await ssh.connect({
    host: '192.168.31.49',
    username: 'siddharth',
    password: 'Darknight',
    readyTimeout: 30000,
  });
  console.log('Connected!\n');

  // Install latest
  console.log('2. Installing bugproof@1.2.6 globally...');
  const installResult = await ssh.execCommand('npm install -g bugproof@1.2.6 2>&1 | tail -5');
  console.log(installResult.stdout);

  // Verify version
  console.log('3. Verifying version...');
  const versionResult = await ssh.execCommand('bugproof --version');
  console.log(`Version: ${versionResult.stdout.trim()}\n`);

  // Test all commands
  console.log('4. Testing all commands...');
  const cmds = [
    '--help', 'capture --help', 'replay --help', 'inspect --help',
    'diff --help', 'doctor --help', 'keygen --help', 'share --help',
    'pull --help', 'prune --help', 'clean --help', 'watch --help',
    'init --help', 'mcp --help', 'verify --help'
  ];

  let pass = 0, fail = 0;
  for (const cmd of cmds) {
    const result = await ssh.execCommand(`bugproof ${cmd} 2>&1 | head -3`);
    const output = result.stdout + result.stderr;
    if (output.includes('Usage:') || output.includes('Options:') || output.includes('Commands:') || result.code === 0) {
      pass++;
      console.log(`  [PASS] bugproof ${cmd}`);
    } else {
      fail++;
      console.log(`  [FAIL] bugproof ${cmd}`);
    }
  }

  console.log(`\n=== Linux Post-Publish Results ===`);
  console.log(`Passed: ${pass} / ${pass + fail}`);

  // Test actual capture + replay on Linux
  console.log('\n5. Testing capture + replay on Linux...');
  await ssh.execCommand('rm -rf /tmp/linux-test && mkdir -p /tmp/linux-test && cd /tmp/linux-test && git init -q && git config user.email "test@test.com" && git config user.name "Test" && echo "test" > test.txt && git add . && git commit -q -m "init"');

  const captureResult = await ssh.execCommand('cd /tmp/linux-test && bugproof capture --skip-secrets -n linux-post-test -- node -e "throw new Error(\'post-publish test\')" 2>&1 | tail -10');
  console.log('Capture output:', captureResult.stdout);

  const replayResult = await ssh.execCommand('cd /tmp/linux-test && bugproof replay linux-post-test.bug 2>&1 | grep -i "reproduction\|exit code"');
  console.log('Replay output:', replayResult.stdout);

  const confirmed = replayResult.stdout.includes('CONFIRMED') || replayResult.stdout.includes('confirmed');
  console.log(`\nLinux capture+replay: ${confirmed ? 'PASS' : 'FAIL'}`);

  ssh.dispose();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
