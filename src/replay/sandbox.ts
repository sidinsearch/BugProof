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
import { normalizeArtifactPath } from '../utils/paths.js';

export interface SandboxOptions {
  mode: 'current' | 'strict' | 'branch';
  originalWorkingDir: string;
  artifactPath: string;
  gitCommit?: string;
  gitBranch?: string;
  /** Optional pre-created directory to place the sandbox into */
  targetDir?: string;
  /** Override source directory — use current dir's git repo instead of captured path */
  sourceDir?: string;
}

export interface SandboxResult {
  workingDirectory: string;
  tempDir?: string;
  needsCleanup: boolean;
  /** True when git checkout failed and we fell back to the artifact's files/ snapshot */
  usedFallback?: boolean;
  /** Reason for fallback (for user messaging) */
  fallbackReason?: string;
  /** Source of files: 'git-worktree' | 'git-clone' | 'artifact-files' | 'original-path' */
  sourceType?: string;
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
        fallbackReason: 'current mode — using artifact files',
        sourceType: 'artifact-files',
      };
    }

    return {
      workingDirectory: options.originalWorkingDir,
      needsCleanup: false,
      usedFallback: true,
      fallbackReason: 'current mode — no artifact files, using original path',
      sourceType: 'original-path',
    };
  }

  // ── branch mode without a branch: fall back to current ──
  if (options.mode === 'branch' && !options.gitBranch) {
    return {
      workingDirectory: options.originalWorkingDir,
      needsCleanup: false,
      usedFallback: true,
      fallbackReason: 'branch mode — no branch info in artifact',
      sourceType: 'original-path',
    };
  }

  // ── strict or branch: try git worktree ──
  const tempDir = options.targetDir || createUniqueTempDir();

  // Determine the ref to checkout
  const ref = options.mode === 'strict' ? options.gitCommit : options.gitBranch;

  // If sourceDir is provided, use it instead of originalWorkingDir
  const repoDir = options.sourceDir || options.originalWorkingDir;

  if (ref) {
    // Security: validate ref before passing to git
    if (!isValidGitRef(ref)) {
      // Invalid ref, skip directly to fallback
    } else {
      const worktreeResult = tryGitWorktree(repoDir, tempDir, ref);

      if (worktreeResult.success) {
        return {
          workingDirectory: tempDir,
          tempDir,
          needsCleanup: true,
          sourceType: 'git-worktree',
        };
      }

      // Worktree failed. For strict mode, try a detached checkout clone.
      if (options.mode === 'strict') {
        const cloneResult = tryGitCloneAndCheckout(repoDir, tempDir, ref);
        if (cloneResult.success) {
          return {
            workingDirectory: tempDir,
            tempDir,
            needsCleanup: true,
            sourceType: 'git-clone',
          };
        }
      }
    }
  }

  // ── Fallback: current-dir git detection ──
  // If original path is inaccessible, check if current directory is the same repo
  // and try to use it for git operations
  if (!fs.existsSync(repoDir) || !isGitRepo(repoDir)) {
    const currentDirRepo = findGitRoot(process.cwd());
    if (currentDirRepo && currentDirRepo !== repoDir && ref) {
      // Current directory is a different git repo — try it
      const currentWorktree = tryGitWorktree(currentDirRepo, tempDir, ref);
      if (currentWorktree.success) {
        return {
          workingDirectory: tempDir,
          tempDir,
          needsCleanup: true,
          usedFallback: true,
          fallbackReason: `original path inaccessible — using current directory's git repo`,
          sourceType: 'git-worktree',
        };
      }

      const currentClone = tryGitCloneAndCheckout(currentDirRepo, tempDir, ref);
      if (currentClone.success) {
        return {
          workingDirectory: tempDir,
          tempDir,
          needsCleanup: true,
          usedFallback: true,
          fallbackReason: `original path inaccessible — cloned from current directory's git repo`,
          sourceType: 'git-clone',
        };
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
      fallbackReason: `git operations failed${!fs.existsSync(repoDir) ? ` (original path: ${normalizeArtifactPath(repoDir)} not found)` : ''} — using artifact files`,
      sourceType: 'artifact-files',
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
    fallbackReason: `no git access and no artifact files — original path: ${normalizeArtifactPath(options.originalWorkingDir)}`,
    sourceType: 'original-path',
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

/**
 * Check if a directory is a git repository.
 */
function isGitRepo(dir: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--git-dir'], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 5000,
  });
  return result.status === 0;
}

/**
 * Find the git root by walking up from the given directory.
 * Returns null if not inside a git repo.
 */
function findGitRoot(startDir: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: startDir,
    encoding: 'utf-8',
    timeout: 5000,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}
