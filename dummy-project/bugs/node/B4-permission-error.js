// ── Bug B4: Filesystem Permission Error ─────────────────────────────────────
// Creates a read-only file, then tries to write to it.
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpFile = path.join(os.tmpdir(), 'bugproof-b4-readonly.txt');

// Create and lock the file
fs.writeFileSync(tmpFile, 'locked content');
fs.chmodSync(tmpFile, 0o444);

try {
  // This should fail on Linux (root may bypass on some systems)
  // On Windows, chmod is limited but we force an EPERM via alternate means
  fs.writeFileSync(tmpFile, 'overwrite attempt');
  // If we got here, chmod didn't block it (Windows).
  // Throw a consistent error for cross-platform fingerprinting.
  throw new Error('PermissionError: EPERM: cannot write to read-only file');
} catch (err) {
  if (err.code === 'EPERM' || err.code === 'EACCES') {
    process.stderr.write('PermissionError: ' + err.code + ': cannot write to read-only file\n');
    process.exit(1);
  }
  // Re-throw the explicit error we created above
  throw err;
} finally {
  // Clean up
  try { fs.chmodSync(tmpFile, 0o644); fs.unlinkSync(tmpFile); } catch {}
}
