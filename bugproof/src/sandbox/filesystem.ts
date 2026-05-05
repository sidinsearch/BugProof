/**
 * Bug-Box Filesystem Isolation
 *
 * Creates a structured temp directory with restrictive permissions.
 * Layout:
 *   bugbox-XXXXX/
 *   ├── files/       — Read-only source snapshot (locked after population)
 *   ├── workspace/   — Read-write CWD for the replayed process
 *   └── logs/        — Read-write stdout/stderr capture
 *
 * Permissions:
 *   Linux/macOS: chmod 0700 (owner-only)
 *   Windows:     icacls inheritance removal + current-user-only grant
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';

export interface IsolatedDirResult {
  /** Root of the entire Bug-Box sandbox */
  rootDir: string;
  /** Read-only directory for captured source files */
  filesDir: string;
  /** Read-write working directory (the replayed process CWD) */
  workspaceDir: string;
  /** Read-write directory for stdout/stderr log capture */
  logsDir: string;
}

/**
 * Creates a new isolated directory structure with restrictive permissions.
 * Works on Linux, macOS, and Windows without requiring root/admin.
 */
export function createIsolatedDir(): IsolatedDirResult {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugbox-'));

  // Apply restrictive permissions to the root
  applyRestrictivePermissions(rootDir);

  // Create subdirectories
  const filesDir = path.join(rootDir, 'files');
  const workspaceDir = path.join(rootDir, 'workspace');
  const logsDir = path.join(rootDir, 'logs');

  fs.mkdirSync(filesDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  return { rootDir, filesDir, workspaceDir, logsDir };
}

/**
 * Locks a directory to read-only.
 * Used after populating filesDir with the source snapshot,
 * so the replayed process cannot modify captured files.
 *
 * Linux/macOS: removes write bit (chmod a-w recursively).
 * Windows: icacls to deny write.
 */
export function lockDirReadOnly(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;

  if (os.platform() === 'win32') {
    // On Windows, use icacls to set read-only attribute on all files
    spawnSync('icacls', [dirPath, '/deny', `${os.userInfo().username}:(W)`, '/T', '/C'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
    });
  } else {
    // Unix: remove write bit recursively
    setPermissionsRecursive(dirPath, 0o555, 0o444);
  }
}

/**
 * Restores write permissions on a directory that was previously locked.
 * Must be called before cleanup if lockDirReadOnly was used.
 */
export function unlockDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;

  if (os.platform() === 'win32') {
    // Remove the deny rule
    spawnSync('icacls', [dirPath, '/remove:d', os.userInfo().username, '/T', '/C'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
    });
  } else {
    // Unix: restore write bit
    setPermissionsRecursive(dirPath, 0o755, 0o644);
  }
}

/**
 * Removes the entire isolated directory.
 * Handles read-only files by unlocking first.
 * Never throws — best-effort cleanup.
 */
export function cleanupIsolatedDir(result: IsolatedDirResult): void {
  if (!fs.existsSync(result.rootDir)) return;

  try {
    // Unlock filesDir in case it was locked read-only
    unlockDir(result.filesDir);
  } catch {
    // Best effort
  }

  try {
    fs.rmSync(result.rootDir, { recursive: true, force: true });
  } catch {
    // Best effort — on Windows, locked handles may prevent immediate removal
  }
}

// ── Internal helpers ──

/**
 * Applies restrictive permissions to the root sandbox directory.
 * Owner-only on Unix. Current-user-only ACL on Windows.
 */
function applyRestrictivePermissions(dirPath: string): void {
  if (os.platform() === 'win32') {
    // Remove inherited ACLs, grant full control to current user only
    spawnSync(
      'icacls',
      [dirPath, '/inheritance:r', '/grant:r', `${os.userInfo().username}:(OI)(CI)F`],
      { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' },
    );
  } else {
    // Unix: 0700 — owner can read/write/execute, nobody else
    fs.chmodSync(dirPath, 0o700);
  }
}

/**
 * Recursively sets permissions on directories and files.
 * dirMode applies to directories, fileMode applies to files.
 */
function setPermissionsRecursive(
  dirPath: string,
  dirMode: number,
  fileMode: number,
): void {
  fs.chmodSync(dirPath, dirMode);

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      setPermissionsRecursive(fullPath, dirMode, fileMode);
    } else if (entry.isFile()) {
      fs.chmodSync(fullPath, fileMode);
    }
  }
}
