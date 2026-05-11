import { NodeSSH } from 'node-ssh';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const ssh = new NodeSSH();

const LINUX_HOST = '192.168.31.49';
const LINUX_USER = 'siddharth';
const LINUX_PASS = 'Darknight';
const REMOTE_DIR = '/home/siddharth/bugproof-test';

async function run() {
  console.log('🚀 Starting Cross-Platform Test Pipeline');

  // 1. Build and pack locally on Windows
  console.log('\n📦 Packaging current Windows build...');
  process.chdir(ROOT_DIR);
  execSync('npm run build', { stdio: 'inherit' });
  
  // Clean up any old bug files
  const files = fs.readdirSync(ROOT_DIR);
  for (const file of files) {
    if (file.endsWith('.bug')) {
      try {
        fs.rmSync(path.join(ROOT_DIR, file), { recursive: true, force: true });
      } catch (e) {
        console.warn(`Could not delete ${file}`);
      }
    }
  }

  // Pack project into tarball (excluding node_modules and .git) to transfer faster
  console.log('   Running npm pack...');
  const tarballRaw = execSync('npm pack --ignore-scripts', { encoding: 'utf8' });
  const tarballName = tarballRaw.trim().split('\n').filter(l => l.endsWith('.tgz')).pop();
  if (!tarballName) throw new Error('Failed to determine tarball name from npm pack output');
  const tarballPath = path.join(ROOT_DIR, tarballName);

  // Capture a Windows artifact
  console.log('\n🪟 Capturing test artifact on Windows...');
  
  // Create a failing script
  fs.writeFileSync('fail.js', 'console.error("Windows Error!"); process.exit(1);');
  execSync('git add fail.js');
  execSync('node dist/cli.js capture --exclude "*.tgz" node fail.js', { stdio: 'inherit' });
  const allBugFiles = fs.readdirSync(ROOT_DIR).filter(f => f.endsWith('.bug'));
  // Find the most recently modified bug file
  let windowsBugFile = null;
  let latestTime = 0;
  for (const f of allBugFiles) {
    const stat = fs.statSync(path.join(ROOT_DIR, f));
    if (stat.mtimeMs > latestTime) {
      latestTime = stat.mtimeMs;
      windowsBugFile = f;
    }
  }
  
  if (!windowsBugFile) throw new Error('Failed to capture Windows artifact!');
  const winBugName = `windows_out_${Date.now()}.bug`;
  fs.copyFileSync(path.join(ROOT_DIR, windowsBugFile), path.join(ROOT_DIR, winBugName));
  console.log(`   Captured Windows artifact: ${winBugName}`);

  // 2. Connect to Linux
  console.log(`\n🔌 Connecting to Linux Env (${LINUX_USER}@${LINUX_HOST})...`);
  await ssh.connect({
    host: LINUX_HOST,
    username: LINUX_USER,
    password: LINUX_PASS,
  });
  console.log('   Connected!');

  // 3. Setup Remote Environment
  console.log('\n🐧 Setting up remote Linux environment...');
  await ssh.execCommand(`rm -rf ${REMOTE_DIR} && mkdir -p ${REMOTE_DIR}`);
  
  console.log(`   Transferring ${tarballName}...`);
  await ssh.putFile(tarballPath, `${REMOTE_DIR}/${tarballName}`);
  
  console.log(`   Transferring ${winBugName}...`);
  await ssh.putFile(path.join(ROOT_DIR, winBugName), `${REMOTE_DIR}/windows.bug`);

  console.log('   Extracting tarball and installing dependencies...');
  await execRemote(`cd ${REMOTE_DIR} && tar -xzf ${tarballName} --strip-components=1`);
  
  // Initialize a dummy git repository so sandbox tests that expect git to exist don't fail
  console.log('   Initializing dummy git repo for tests...');
  await execRemote(`cd ${REMOTE_DIR} && git init && git config user.name "Tester" && git config user.email "test@example.com" && git add . && git commit -m "Init"`);

  await execRemote(`cd ${REMOTE_DIR} && npm install --production=false --ignore-scripts`, true); // install all deps, skip prepare (dist shipped)

  // 4. Quick verification: CLI works on Linux
  console.log('\n🧪 Verifying CLI works on Linux...');
  const doctorResult = await execRemote(`cd ${REMOTE_DIR} && node dist/cli.js doctor`, true);
  if (doctorResult.code !== 0) {
    console.error('❌ Linux CLI check failed!');
    process.exit(1);
  }
  console.log('✅ Linux CLI works!');

  // 5. Cross-Platform Replay Tests
  
  // Replay Windows Artifact on Linux
  console.log('\n🪟 -> 🐧 Replaying Windows artifact on Linux...');
  const winOnLinux = await execRemote(`cd ${REMOTE_DIR} && node dist/cli.js replay windows.bug --version-match strict`);
  if (!winOnLinux.stdout.includes('REPRODUCTION CONFIRMED')) {
    console.error('❌ Failed to reproduce Windows artifact on Linux!');
    process.exit(1);
  }
  console.log('✅ Replay successful!');

  // Capture Linux Artifact
  console.log('\n🐧 Capturing test artifact on Linux...');
  await execRemote(`cd ${REMOTE_DIR} && echo "console.error('Linux Error!'); process.exit(1);" > fail_linux.js`);
  await execRemote(`cd ${REMOTE_DIR} && git add fail_linux.js`);
  await execRemote(`cd ${REMOTE_DIR} && node dist/cli.js capture --exclude "*.tgz" node fail_linux.js`);
  
  const linuxFilesRaw = await execRemote(`cd ${REMOTE_DIR} && ls -1 *.bug`);
  const linuxBugFile = linuxFilesRaw.stdout.split('\n').find(f => f.trim().endsWith('.bug') && f.trim() !== 'windows.bug');
  if (!linuxBugFile) throw new Error('Failed to find Linux artifact!');
  const cleanLinuxBugFile = linuxBugFile.trim();
  await execRemote(`cd ${REMOTE_DIR} && mv ${cleanLinuxBugFile} linux.bug`);
  console.log(`   Captured Linux artifact: linux.bug`);

  // Download Linux Artifact to Windows
  console.log('\n⬇️ Downloading Linux artifact to Windows...');
  await ssh.getFile(path.join(ROOT_DIR, 'linux.bug'), `${REMOTE_DIR}/linux.bug`);

  // Replay Linux Artifact on Windows
  console.log('\n🐧 -> 🪟 Replaying Linux artifact on Windows...');
  try {
    const replayOut = execSync('node dist/cli.js replay linux.bug --version-match strict', { encoding: 'utf8' });
    console.log(replayOut);
    if (!replayOut.includes('REPRODUCTION CONFIRMED')) {
      throw new Error('Replay output missing confirmation');
    }
    console.log('✅ Replay successful!');
  } catch (err) {
    console.error(err.stdout || err.message);
    console.error('❌ Failed to reproduce Linux artifact on Windows!');
    process.exit(1);
  }

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  fs.rmSync(tarballPath, { force: true });
  try { fs.rmSync('fail.js', { force: true }); execSync('git rm -f fail.js'); } catch (e) {}
  try { fs.rmSync(winBugName, { force: true }); } catch (e) {}
  try { fs.rmSync('linux.bug', { force: true }); } catch (e) {}
  ssh.dispose();

  console.log('\n🎉 Cross-Platform Pipeline Completed Successfully!');
}

async function execRemote(cmd, stream = false) {
  const result = await ssh.execCommand(cmd, {
    onStdout: stream ? (chunk) => process.stdout.write(chunk.toString('utf8')) : undefined,
    onStderr: stream ? (chunk) => process.stderr.write(chunk.toString('utf8')) : undefined,
  });
  if (result.code !== 0 && !stream) {
    console.error(`Command failed: ${cmd}\nSTDERR:\n${result.stderr}\nSTDOUT:\n${result.stdout}`);
    throw new Error(`Remote command failed with code ${result.code}`);
  }
  return result;
}

run().catch(err => {
  console.error('\n💥 Pipeline Error:', err);
  ssh.dispose();
  process.exit(1);
});
