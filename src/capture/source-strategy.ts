/**
 * Smart Source Strategy
 *
 * Two-tier approach for including source code in a .bug artifact:
 *
 * Tier 1 (Git available):
 *   - git-full:  Clean working tree → record commit only (zero files shipped)
 *   - git-patch: Dirty working tree → record commit + diff patch (tiny)
 *   - git-files: Force mode → ship all tracked files
 *
 * Tier 2 (No Git):
 *   - full-copy: Ship the entire codebase (excluding heavy dirs like node_modules)
 *               up to a configurable size limit (default 100MB).
 *               If size exceeds the limit → error out, recommend installing git.
 *
 * Why not stacktrace extraction? Because the file that appears in the error
 * is often NOT the file that was changed to cause the bug. Transitive imports,
 * config files, and build artifacts make guessing unreliable. Ship everything
 * or use git — no middle ground that loses reproducibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

type SourceStrategy = 'git-full' | 'git-patch' | 'git-files' | 'full-copy' | 'exceeded';

export interface SourceStrategyResult {
  strategy: SourceStrategy;
  /** Git commit hash (if available) */
  commit?: string;
  /** Git diff patch content (if dirty) */
  patch?: string;
  /** List of relative file paths to include in artifact */
  filesToInclude: string[];
  /** Total size in bytes of files to include */
  totalSize: number;
  /** Human-readable explanation */
  reason: string;
  /** If true, capture should abort — codebase too large without git */
  shouldAbort: boolean;
}

export interface SourceStrategyOptions {
  workingDir: string;
  /** Force include all git files even when commit is available */
  forceIncludeFiles?: boolean;
  /** Max total codebase size to ship without git (bytes). Default 100MB. */
  maxCodebaseSize?: number;
  /** Max individual file size (bytes). Default 2MB. */
  maxFileSize?: number;
  /** Additional exclude patterns */
  excludePatterns?: string[];
}

/** Default max codebase size without git: 100MB */
const DEFAULT_MAX_CODEBASE_SIZE = 100 * 1024 * 1024;
/** Default max individual file size: 2MB */
const DEFAULT_MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Directories always excluded from full-copy (heavy, regeneratable) */
const ALWAYS_EXCLUDE_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  '__pycache__', '.venv', 'venv', 'env', '.env',
  'vendor', '.gradle', '.idea', '.vs', '.vscode',
  'coverage', '.nyc_output', '.next', '.nuxt',
  'tmp', 'temp', '.cache', '.parcel-cache',
  'bin', 'obj', 'packages', '.dart_tool',
];

/** File extensions to skip (binary/compiled) — but NOT compiled language artifacts */
const SKIP_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.o', '.obj',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.woff', '.woff2', '.ttf',
  '.eot', '.pdf', '.psd', '.ai', '.sketch',
]);

/** Compiled language artifact extensions that SHOULD be included for replay */
const COMPILED_ARTIFACT_EXTENSIONS = new Set([
  '.class',    // Java
  '.jar',      // Java archives
  '.war',      // Java web archives
  '.ear',      // Java enterprise archives
  '.pyc',      // Python bytecode (include for replay)
  '.pyo',      // Python optimized bytecode
  '.wasm',     // WebAssembly
  '.node',     // Node.js native addons
]);

/**
 * Determines the optimal source inclusion strategy.
 */
export function determineSourceStrategy(options: SourceStrategyOptions): SourceStrategyResult {
  // Check if we're in a git repo
  const gitCheck = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: options.workingDir,
    encoding: 'utf-8',
    timeout: 5000,
  });

  const isGitRepo = gitCheck.status === 0 && gitCheck.stdout.trim() === 'true';

  if (isGitRepo) {
    return determineGitStrategy(options.workingDir, options.forceIncludeFiles);
  }

  // No git — ship the full codebase with size limit
  return determineFullCopyStrategy(options);
}

/**
 * Determines the git-based strategy.
 */
function determineGitStrategy(
  workingDir: string,
  forceIncludeFiles?: boolean,
): SourceStrategyResult {
  // Get current commit
  const commitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: workingDir,
    encoding: 'utf-8',
    timeout: 5000,
  });
  const commit = commitResult.status === 0 ? commitResult.stdout.trim() : undefined;

  // Check if working tree is dirty
  const dirtyResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: workingDir,
    encoding: 'utf-8',
    timeout: 10000,
  });
  const isDirty = dirtyResult.status === 0 && dirtyResult.stdout.trim().length > 0;

  if (forceIncludeFiles) {
    return {
      strategy: 'git-files',
      commit,
      filesToInclude: [],
      totalSize: 0,
      reason: 'Git repo detected. Including all tracked files (forced).',
      shouldAbort: false,
    };
  }

  if (!isDirty && commit) {
    return {
      strategy: 'git-full',
      commit,
      filesToInclude: [],
      totalSize: 0,
      reason: `Git repo clean at ${commit.slice(0, 8)}. No files shipped — replay uses git checkout.`,
      shouldAbort: false,
    };
  }

  if (isDirty && commit) {
    // Dirty tree — generate a patch of uncommitted changes
    const patchResult = spawnSync('git', ['diff', 'HEAD'], {
      cwd: workingDir,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const stagedResult = spawnSync('git', ['diff', '--cached'], {
      cwd: workingDir,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    let patch = '';
    if (patchResult.status === 0) patch += patchResult.stdout;
    if (stagedResult.status === 0 && stagedResult.stdout.trim()) {
      patch += '\n' + stagedResult.stdout;
    }

    if (patch.trim()) {
      return {
        strategy: 'git-patch',
        commit,
        patch,
        filesToInclude: [],
        totalSize: Buffer.byteLength(patch),
        reason: `Git repo dirty at ${commit.slice(0, 8)}. Shipping commit ref + diff patch (${(Buffer.byteLength(patch) / 1024).toFixed(1)} KB).`,
        shouldAbort: false,
      };
    }
  }

  // Fallback: ship tracked files
  return {
    strategy: 'git-files',
    commit,
    filesToInclude: [],
    totalSize: 0,
    reason: 'Git repo detected. Including tracked files.',
    shouldAbort: false,
  };
}

/**
 * Collects all project files (excluding heavy directories and binaries)
 * and checks against the size limit.
 */
function determineFullCopyStrategy(options: SourceStrategyOptions): SourceStrategyResult {
  const maxCodebaseSize = options.maxCodebaseSize ?? DEFAULT_MAX_CODEBASE_SIZE;
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const extraExcludes = new Set((options.excludePatterns || []).map(p => p.replace(/[/\\*]/g, '')));

  const files: string[] = [];
  let totalSize = 0;
  let exceeded = false;

  function walk(dir: string, relativeBase: string): void {
    if (exceeded) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (exceeded) return;

      // Skip symlinks (security)
      if (entry.isSymbolicLink()) continue;

      const name = entry.name;
      const relPath = relativeBase ? `${relativeBase}/${name}` : name;

      if (entry.isDirectory()) {
        // Skip always-excluded directories
        if (ALWAYS_EXCLUDE_DIRS.includes(name) || extraExcludes.has(name)) continue;
        // Skip hidden directories (except common ones like .github)
        if (name.startsWith('.') && name !== '.github') continue;
        walk(path.join(dir, name), relPath);
      } else if (entry.isFile()) {
        // Skip binary extensions
        const ext = path.extname(name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) continue;
        // Skip hidden files
        if (name.startsWith('.') && name !== '.env.example') continue;

        try {
          const stat = fs.statSync(path.join(dir, name));
          // Skip files exceeding individual size limit
          if (stat.size > maxFileSize) continue;

          totalSize += stat.size;
          if (totalSize > maxCodebaseSize) {
            exceeded = true;
            return;
          }

          files.push(relPath);
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(options.workingDir, '');

  if (exceeded) {
    const limitMB = (maxCodebaseSize / (1024 * 1024)).toFixed(0);
    return {
      strategy: 'exceeded',
      filesToInclude: [],
      totalSize,
      reason: `Codebase exceeds ${limitMB}MB limit. Install git for efficient bug recording: git init && git add . && git commit -m "init"`,
      shouldAbort: true,
    };
  }

  const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
  return {
    strategy: 'full-copy',
    filesToInclude: files,
    totalSize,
    reason: `No git repo. Shipping full codebase (${files.length} files, ${sizeMB} MB).`,
    shouldAbort: false,
  };
}
