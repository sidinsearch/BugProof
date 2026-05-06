import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// ESM-safe __dirname equivalent
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

const FLAG_FILE = path.join(os.homedir(), '.bugproof', '.associations_registered');

/**
 * Silently attempts to register the .bug extension icon on the OS.
 * Only runs once per user profile (tracked via a flag file).
 *
 * Uses spawnSync with an argument array (not execSync with a shell string) to
 * avoid all shell quoting issues — paths with spaces or backslashes are passed
 * verbatim to reg.exe.
 */
export function registerAssociationsSilently(): void {
  if (fs.existsSync(FLAG_FILE)) {
    return;
  }

  try {
    // Resolve assets: package layout is dist/utils/associations.js -> dist/ -> root -> assets/
    const assetsDir = path.resolve(_dirname, '../../assets');
    const iconPath = path.join(assetsDir, 'icon-512x512.png');

    if (!fs.existsSync(iconPath)) {
      return; // Skip silently if the asset is missing (e.g. stripped installs)
    }

    if (process.platform === 'win32') {
      // Register in HKCU — no Administrator privileges required.
      // spawnSync avoids all shell string quoting pitfalls.
      const reg = (args: string[]) =>
        spawnSync('reg', args, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });

      reg(['add', 'HKCU\\Software\\Classes\\.bug', '/ve', '/d', 'BugProof.Artifact', '/f']);
      reg(['add', 'HKCU\\Software\\Classes\\BugProof.Artifact', '/ve', '/d', 'BugProof Artifact', '/f']);
      // iconPath is passed as a plain argument — no shell quoting needed
      reg(['add', 'HKCU\\Software\\Classes\\BugProof.Artifact\\DefaultIcon', '/ve', '/d', iconPath, '/f']);
    }

    // Write flag file so we don't repeat this on every CLI invocation
    fs.mkdirSync(path.dirname(FLAG_FILE), { recursive: true });
    fs.writeFileSync(FLAG_FILE, new Date().toISOString(), 'utf-8');
  } catch {
    // Silently ignore failures — icon registration must never crash the CLI
  }
}
