import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Provide __dirname fallback if we switch to ES modules, but BugProof uses CommonJS/TS setup right now.
// Actually, since tsconfig.json is likely outputting CommonJS, __dirname is available.

const FLAG_FILE = path.join(os.homedir(), '.bugproof', '.associations_registered');

/**
 * Silently attempts to register the .bug extension icon on the OS.
 * Only runs once per user profile (tracked via a flag file).
 */
export function registerAssociationsSilently(): void {
  if (fs.existsSync(FLAG_FILE)) {
    return;
  }

  try {
    // Resolve assets assuming we are in dist/utils/ or src/utils/
    const assetsDir = path.resolve(__dirname, '../../assets');
    const iconPath = path.join(assetsDir, 'bugproof_logo_1778006346737.png');

    if (!fs.existsSync(iconPath)) {
      return; // Skip if no icon available
    }

    if (process.platform === 'win32') {
      // Register in HKCU to avoid requiring Administrator privileges
      execSync(`reg add "HKCU\\Software\\Classes\\.bug" /ve /d "BugProof.Artifact" /f`, { stdio: 'ignore' });
      execSync(`reg add "HKCU\\Software\\Classes\\BugProof.Artifact" /ve /d "BugProof Artifact" /f`, { stdio: 'ignore' });
      execSync(`reg add "HKCU\\Software\\Classes\\BugProof.Artifact\\DefaultIcon" /ve /d "\\"${iconPath}\\"" /f`, { stdio: 'ignore' });
    }
    
    // Write flag file so we don't try this again
    fs.mkdirSync(path.dirname(FLAG_FILE), { recursive: true });
    fs.writeFileSync(FLAG_FILE, new Date().toISOString(), 'utf-8');
  } catch (err) {
    // Silently ignore failures (don't crash the CLI)
  }
}
