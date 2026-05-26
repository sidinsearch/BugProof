// Debug artifact file contents
import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ssh = new NodeSSH();

async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });

  const name = 'python-runtime-error';
  const localPath = `D:\\Dummy\\${name}`;
  const bugFile = fs.readdirSync(localPath).find(f => f.endsWith('.bug'));

  // Extract and check contents
  const extractDir = path.join(localPath, 'extracted2');
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`tar -xf ${bugFile} -C ${extractDir}`, { cwd: localPath });

  console.log('Files in artifact:');
  const files = fs.readdirSync(extractDir, { recursive: true });
  for (const f of files) {
    const stat = fs.statSync(path.join(extractDir, f));
    console.log(`  ${f} (${stat.size} bytes)`);
  }

  // Check files.json
  const filesJson = JSON.parse(fs.readFileSync(path.join(extractDir, 'files.json'), 'utf-8'));
  console.log('\nfiles.json entries:', filesJson.length);
  for (const entry of filesJson.slice(0, 10)) {
    console.log(`  ${entry.path} (${entry.size} bytes)`);
  }

  // Check source-strategy.json
  const sourceStrategy = JSON.parse(fs.readFileSync(path.join(extractDir, 'source-strategy.json'), 'utf-8'));
  console.log('\nSource strategy:', sourceStrategy.strategy);
  console.log('Files to include:', sourceStrategy.filesToInclude?.length || 0);

  // Check if app.py is in the artifact
  const hasAppPy = filesJson.some(f => f.path.includes('app.py'));
  console.log('\napp.py in artifact:', hasAppPy);

  // Replay on Linux with --source-dir
  console.log('\n=== Testing replay with --source-dir ===');
  await ssh.execCommand(`rm -rf /tmp/debug-test2 && mkdir -p /tmp/debug-test2/${name}`);
  await ssh.putFile(path.join(localPath, bugFile), `/tmp/debug-test2/${name}/${bugFile}`);

  // Try with source-dir pointing to the dummy project on Linux
  // First sync the project
  const tarPath = `D:\\BugProof\\scripts\\${name}-src.tar.gz`;
  execSync(`tar -czf "${tarPath}" -C "D:\\Dummy" "${name}"`, { stdio: 'pipe' });
  await ssh.putFile(tarPath, `/tmp/${name}-src.tar.gz`);
  await ssh.execCommand(`cd /tmp && tar xzf ${name}-src.tar.gz && rm ${name}-src.tar.gz`);
  fs.unlinkSync(tarPath);

  const replayResult = await ssh.execCommand(`cd /tmp/debug-test2/${name} && bugproof replay ${bugFile} --source-dir /tmp/${name} 2>&1`);
  console.log('Replay with --source-dir:');
  console.log(replayResult.stdout);

  ssh.dispose();
}

main().catch(e => { console.error(e.message); process.exit(1); });
