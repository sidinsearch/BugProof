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

export interface SandboxOptions {
  mode: 'current' | 'strict' | 'branch';
  originalWorkingDir: string;
  artifactPath: string;
  gitCommit?: string;
  gitBranch?: string;
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-replay-'));

  // Determine the ref to checkout
  const ref = options.mode === 'strict' ? options.gitCommit : options.gitBranch;

  if (ref) {
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
  fs.rmSync(tempDir, { recursive: true, force: true });
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
        // This is a worktree, find the parent repo and remove the worktree
        spawnSync('git', ['worktree', 'remove', '--force', result.tempDir], {
          encoding: 'utf-8',
          timeout: 10000,
        });
        return;
      }
    }
  } catch {
    // Fall through to force delete
  }

  try {
    fs.rmSync(result.tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
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
    ['worktree', 'add', '--detach', targetDir, ref],
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

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
