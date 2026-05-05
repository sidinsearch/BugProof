// B4: Filesystem Permission Error
// Produces a deterministic permission error using a platform-neutral approach.
// Both OSes use the same mechanism: chmod a readonly file, then try to overwrite.
// The stderr message is hardcoded to be identical on both platforms.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-e2e-'));
const target = path.join(tmpDir, 'locked.txt');

// Create file, then lock it read-only
fs.writeFileSync(target, 'original content');
fs.chmodSync(target, 0o444);

try {
  // Attempt to overwrite — this throws EACCES on Linux.
  // On Windows, chmod(0o444) may not enforce, so we check and force an error.
  fs.writeFileSync(target, 'should fail');
  
  // If we reach here, the write succeeded (Windows ignoring chmod).
  // Force a consistent error for the fingerprint:
  throw new Error('EPERM: operation not permitted');
} catch (err) {
  // Emit a fixed, platform-neutral message so fingerprints match cross-platform.
  // The exact error code (EACCES vs EPERM) varies by OS, but our message is constant.
  console.error("PermissionError: cannot write to read-only file");
  console.error("  Detail: operation not permitted on locked resource");
  process.exit(1);
} finally {
  try {
    fs.chmodSync(target, 0o644);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best effort cleanup */ }
}
