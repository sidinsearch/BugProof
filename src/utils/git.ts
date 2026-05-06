import { spawnSync } from 'child_process';

export interface GitContext {
  commit: string | undefined;
  branch: string | undefined;
  dirty: boolean;
  repo: string | undefined;
  tags: string[];
}

/**
 * Reads git metadata from the working directory.
 * Returns undefined fields when git is unavailable or the directory is not a repo.
 */
export function getGitContext(cwd: string): GitContext {
  const ctx: GitContext = {
    commit: undefined,
    branch: undefined,
    dirty: false,
    repo: undefined,
    tags: [],
  };

  try {
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8', timeout: 5000 });
    if (head.status === 0) {
      ctx.commit = head.stdout.trim();
    }

    const branch = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf-8', timeout: 5000 });
    if (branch.status === 0) {
      ctx.branch = branch.stdout.trim() || undefined;
    }

    const status = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8', timeout: 5000 });
    if (status.status === 0) {
      ctx.dirty = status.stdout.trim().length > 0;
    }

    const remote = spawnSync('git', ['config', '--get', 'remote.origin.url'], { cwd, encoding: 'utf-8', timeout: 5000 });
    if (remote.status === 0) {
      ctx.repo = remote.stdout.trim() || undefined;
    }

    const tags = spawnSync('git', ['tag', '--points-at', 'HEAD'], { cwd, encoding: 'utf-8', timeout: 5000 });
    if (tags.status === 0 && tags.stdout.trim()) {
      ctx.tags = tags.stdout.trim().split('\n').filter(Boolean);
    }
  } catch {
    // git not available or not a repo, return defaults
  }

  return ctx;
}
