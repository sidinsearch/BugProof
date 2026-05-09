import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const FLAG_FILE = path.join(os.homedir(), '.bugproof', '.associations_registered');

export function registerAssociationsSilently(assetsDir?: string): void {
  if (fs.existsSync(FLAG_FILE)) {
    return;
  }

  try {
    const iconPath = path.join(assetsDir ?? path.resolve(process.cwd(), 'assets'), 'icon-512x512.png');

    if (!fs.existsSync(iconPath)) {
      return;
    }

    if (process.platform === 'win32') {
      const reg = (args: string[]) =>
        spawnSync('reg', args, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });

      reg(['add', 'HKCU\\Software\\Classes\\.bug', '/ve', '/d', 'BugProof.Artifact', '/f']);
      reg(['add', 'HKCU\\Software\\Classes\\BugProof.Artifact', '/ve', '/d', 'BugProof Artifact', '/f']);
      reg(['add', 'HKCU\\Software\\Classes\\BugProof.Artifact\\DefaultIcon', '/ve', '/d', iconPath, '/f']);
    }

    fs.mkdirSync(path.dirname(FLAG_FILE), { recursive: true });
    fs.writeFileSync(FLAG_FILE, new Date().toISOString(), 'utf-8');
  } catch {
    // Silently ignore failures — icon registration must never crash the CLI
  }
}
