import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconPath = path.resolve(__dirname, '../assets/icon-512x512.png');
console.log('Icon path:', iconPath);
console.log('Icon exists:', fs.existsSync(iconPath));
console.log('Username:', os.userInfo().username);

try {
  let out;

  out = execSync('reg add "HKCU\\Software\\Classes\\.bug" /ve /d "BugProof.Artifact" /f', { encoding: 'utf8' });
  console.log('[1] .bug extension registered:', out.trim());

  out = execSync('reg add "HKCU\\Software\\Classes\\BugProof.Artifact" /ve /d "BugProof Artifact" /f', { encoding: 'utf8' });
  console.log('[2] ProgID registered:', out.trim());

  // Icon path value — embed the path directly (no extra quoting needed for reg.exe /d)
  out = execSync(`reg add "HKCU\\Software\\Classes\\BugProof.Artifact\\DefaultIcon" /ve /d "${iconPath}" /f`, { encoding: 'utf8' });
  console.log('[3] DefaultIcon registered:', out.trim());

  // Verify
  const verify = execSync('reg query "HKCU\\Software\\Classes\\BugProof.Artifact\\DefaultIcon"', { encoding: 'utf8' });
  console.log('\n--- Verification ---');
  console.log(verify);

} catch (e) {
  console.error('FAILED:', e.message);
  if (e.stderr) console.error('STDERR:', e.stderr);
}
