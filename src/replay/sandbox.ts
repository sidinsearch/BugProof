/**
 * Replay Sandbox: creates an isolated workspace for deterministic replay.
 *
 * Three modes:
 *   - current: run in cwd (no isolation, fast)
 *   - strict:  git worktree at exact commit, falls back to artifact files/
 *   - branch:  git worktree at branch tip, falls back to current
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { isValidGitRef } from '../utils/security.js';

export interface SandboxOptions {
  mode: 'current' | 'strict' | 'branch';
  originalWorkingDir: string;
  artifactPath: string;
  gitCommit?: string;
  gitBranch?: string;
  /** Optional pre-created directory to place the sandbox into */
  targetDir?: string;
}

export interface SandboxResult {
  workingDirectory: string;
  tempDir?: string;
  needsCleanup: boolean;
  /** True when git checkout failed and we fell back to the artifact's files/ snapshot */
  usedFallback?: boolean;
}

/**
 * Creates a sandbox workspace for replay.
 */
export async function createSandbox(options: SandboxOptions): Promise<SandboxResult> {
  // ── current mode: no isolation ──
  if (options.mode === 'current') {
    const tempDir = options.targetDir || createUniqueTempDir();
    const artifactFilesDir = path.join(options.artifactPath, 'files');

    if (fs.existsSync(artifactFilesDir)) {
      copyDirRecursive(artifactFilesDir, tempDir);
      return {
        workingDirectory: tempDir,
        tempDir,
        needsCleanup: true,
        usedFallback: true,
      };
    }

    return {
      workingDirectory: options.originalWorkingDir,
      needsCleanup: false,
    };
  }

  // ── branch mode without a branch: fall back to current ──
  if (options.mode === 'branch' && !options.gitBranch) {
    return {
      workingDirectory: options.originalWorkingDir,
      needsCleanup: false,
    };
  }

  // ── strict or branch: try git worktree ──
  const tempDir = options.targetDir || createUniqueTempDir();

  // Determine the ref to checkout
  const ref = options.mode === 'strict' ? options.gitCommit : options.gitBranch;

  if (ref) {
    // Security: validate ref before passing to git
    if (!isValidGitRef(ref)) {
      // Invalid ref, skip directly to fallback
    } else {
      const worktreeResult = tryGitWorktree(options.originalWorkingDir, tempDir, ref);

      if (worktreeResult.success) {
        return {
          workingDirectory: tempDir,
          tempDir,
          needsCleanup: true,
        };
      }

      // Worktree failed. For strict mode, try a detached checkout clone.
      if (options.mode === 'strict') {
        const cloneResult = tryGitCloneAndCheckout(options.originalWorkingDir, tempDir, ref);
        if (cloneResult.success) {
          return {
            workingDirectory: tempDir,
            tempDir,
            needsCleanup: true,
          };
        }
      }
    }
  }

  // ── Fallback: copy artifact's files/ snapshot into the temp dir ──
  const artifactFilesDir = path.join(options.artifactPath, 'files');
  if (fs.existsSync(artifactFilesDir)) {
    copyDirRecursive(artifactFilesDir, tempDir);
    return {
      workingDirectory: tempDir,
      tempDir,
      needsCleanup: true,
      usedFallback: true,
    };
  }

  // Nothing worked, clean up and fall back to cwd
  if (!options.targetDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return {
    workingDirectory: options.originalWorkingDir,
    needsCleanup: false,
    usedFallback: true,
  };
}

/**
 * Removes the sandbox temp directory.
 */
export function cleanupSandbox(result: SandboxResult): void {
  if (!result.needsCleanup || !result.tempDir) return;

  try {
    // If it was a worktree, remove it properly first
    const gitDir = path.join(result.tempDir, '.git');
    if (fs.existsSync(gitDir)) {
      const gitContent = fs.readFileSync(gitDir, 'utf-8').trim();
      if (gitContent.startsWith('gitdir:')) {
        const repoRoot = resolveWorktreeRepoRoot(gitContent, result.tempDir);
        if (repoRoot) {
          const removeResult = spawnSync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', result.tempDir], {
            encoding: 'utf-8',
            timeout: 10000,
          });
          if (removeResult.status === 0) {
            return;
          }
        }
      }
    }
  } catch {
    // Fall through to force delete
  }

  removeDirWithRetry(result.tempDir);
}

// ── Internal helpers ──

function tryGitWorktree(
  repoDir: string,
  targetDir: string,
  ref: string,
): { success: boolean } {
  // First verify the ref exists in this repo
  const verify = spawnSync('git', ['rev-parse', '--verify', ref], {
    cwd: repoDir,
    encoding: 'utf-8',
    timeout: 5000,
  });

  if (verify.status !== 0) {
    return { success: false };
  }

  // Create a detached worktree
  const result = spawnSync(
    'git',
    ['worktree', 'add', '--detach', targetDir, '--', ref],
    { cwd: repoDir, encoding: 'utf-8', timeout: 30000 },
  );

  return { success: result.status === 0 };
}

function tryGitCloneAndCheckout(
  repoDir: string,
  targetDir: string,
  commitSha: string,
): { success: boolean } {
  // Local clone (no network, shares objects via hardlinks)
  const clone = spawnSync(
    'git',
    ['clone', '--no-checkout', '--shared', repoDir, targetDir],
    { encoding: 'utf-8', timeout: 30000 },
  );

  if (clone.status !== 0) {
    return { success: false };
  }

  const checkout = spawnSync(
    'git',
    ['checkout', commitSha],
    { cwd: targetDir, encoding: 'utf-8', timeout: 10000 },
  );

  return { success: checkout.status === 0 };
}

function createUniqueTempDir(): string {
  const prefix = `bugproof-replay-${process.pid}-`;
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function resolveWorktreeRepoRoot(gitFileContent: string, tempDir: string): string | null {
  const gitdirPath = gitFileContent.slice('gitdir:'.length).trim();
  if (!gitdirPath) {
    return null;
  }

  const resolvedGitDir = path.resolve(tempDir, gitdirPath);
  const marker = `${path.sep}.git${path.sep}worktrees${path.sep}`;
  const markerIndex = resolvedGitDir.lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  return resolvedGitDir.slice(0, markerIndex);
}

function removeDirWithRetry(targetDir: string): void {
  for (let i = 0; i < 3; i += 1) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      return;
    } catch {
      // Best-effort retries in case of transient locks.
    }
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    // Security: skip symlinks to prevent escape attacks
    if (entry.isSymbolicLink()) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
