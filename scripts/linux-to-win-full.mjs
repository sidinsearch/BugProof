import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ssh = new NodeSSH();
const results = [];

async function main() {
  await ssh.connect({ host: '192.168.31.49', username: 'siddharth', password: 'Darknight', readyTimeout: 30000 });

  const testCases = [
    { name: 'node-crash-error', linuxCmd: 'node index.js' },
    { name: 'node-syntax-error', linuxCmd: 'node index.js' },
    { name: 'python-runtime-error', linuxCmd: 'python3 main.py' },
    { name: 'python-div-zero', linuxCmd: 'python3 main.py' },
    { name: 'java-exception', linuxCmd: 'java Main.java' },
  ];

  for (const tc of testCases) {
    console.log(`\n--- Linux Capture → Windows Replay: ${tc.name} ---`);
    await ssh.execCommand(`rm -rf /tmp/linux-capture && mkdir -p /tmp/linux-capture/${tc.name}`);

    const tarPath = `D:\\BugProof\\scripts\\${tc.name}-src.tar.gz`;
    try {
      execSync(`tar -czf "${tarPath}" -C "D:\\Dummy" "${tc.name}"`, { stdio: 'pipe' });
      await ssh.putFile(tarPath, `/tmp/${tc.name}-src.tar.gz`);
      await ssh.execCommand(`cd /tmp && tar xzf ${tc.name}-src.tar.gz && rm ${tc.name}-src.tar.gz`);
      fs.unlinkSync(tarPath);
    } catch { continue; }

    const captureResult = await ssh.execCommand(`cd /tmp/${tc.name} && rm -f *.bug && bugproof capture --skip-secrets -n ${tc.name}-linux -- ${tc.linuxCmd} 2>&1 | tail -5`);
    const bugCheck = await ssh.execCommand(`cd /tmp/${tc.name} && ls *.bug 2>/dev/null || echo "NO_BUG"`);
    if (!bugCheck.stdout.includes('.bug')) { console.log(`  Linux capture FAILED`); results.push({ name: tc.name, replayed: false }); continue; }

    const bugFile = bugCheck.stdout.trim().split('\n').pop();
    const winDir = `D:\\Dummy\\${tc.name}\\linux-capture-lw`;
    if (!fs.existsSync(winDir)) fs.mkdirSync(winDir, { recursive: true });
    await ssh.getFile(path.join(winDir, bugFile), `/tmp/${tc.name}/${bugFile}`);

    process.chdir(winDir);
    try {
      const replayOut = execSync(`node D:\\BugProof\\dist\\cli.js replay ${bugFile}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const confirmed = replayOut.includes('REPRODUCTION CONFIRMED') || replayOut.includes('Reproduction confirmed');
      console.log(`  Windows replay: ${confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`);
      results.push({ name: tc.name, replayed: confirmed });
    } catch (e) {
      const output = e.stdout || e.stderr || '';
      const confirmed = output.includes('REPRODUCTION CONFIRMED') || output.includes('Reproduction confirmed');
      console.log(`  Windows replay: ${confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`);
      results.push({ name: tc.name, replayed: confirmed });
    }
  }

  console.log('\n=== Linux → Windows Results ===');
  results.forEach(r => console.log(`  ${r.name}: ${r.replayed ? 'PASS' : 'FAIL'}`));
  const pass = results.filter(r => r.replayed).length;
  console.log(`\n${pass}/${results.length} passed`);

  ssh.dispose();
}

main().catch(e => { console.error(e.message); process.exit(1); });
