import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { zipDirectory } from '../utils/archive.js';
import { filterByExcludePatterns } from '../utils/exclude.js';
import { isPathWithinBoundary } from '../utils/security.js';
import { ArtifactManifest, EnvSchema, RunConfig, ArtifactMetadata } from '../types/artifact.js';
import { SourceStrategyResult } from './source-strategy.js';
import { FailureRecord } from '../types/failure.js';
import { EnvSnapshot } from './env-snapshot.js';
import { ProjectLanguageContext } from './language-support.js';
import {
  KeyPair,
  SIGNATURE_FILE,
  buildSignedPayload,
  signPayload,
} from '../utils/signing.js';

export interface PackageOptions {
  manifest: ArtifactManifest;
  envSchema: EnvSchema;
  runConfig: RunConfig;
  metadata: ArtifactMetadata;
  failure: FailureRecord;
  stdout: string;
  stderr: string;
  secretKeys: string[];
  includeUntracked?: boolean;
  excludePatterns?: string[];
  /** Smart source strategy result (if available) */
  sourceStrategy?: SourceStrategyResult;
  /** Environment snapshot (runtime versions) */
  envSnapshot?: EnvSnapshot;
  /** Detected project languages and build context */
  languageContext?: ProjectLanguageContext;
  /** If provided, the artifact is signed with this Ed25519 keypair */
  signingKey?: KeyPair;
  /** Optional human-readable signer identity attached to the signature */
  signer?: string;
}

export interface FileEntry {
  path: string;
  size: number;
  sha256: string;
}

const MAX_ARTIFACT_SIZE = 100 * 1024 * 1024; // 100MB hard limit
const WARN_THRESHOLD    = 100 * 1024 * 1024;  // 100MB warning
const MAX_FILE_COUNT    = 10000;            // 10k files hard limit

/**
 * Packages the artifact into the .bug directory format specified in DESIGN.md.
 *
 * Directory layout:
 *   manifest.json
 *   env.schema.json
 *   metadata.json
 *   run.json          (environment secrets stripped)
 *   failure.json
 *   logs/stdout.txt
 *   logs/stderr.txt
 *   logs/fingerprint.json
 *   files/...          (git-tracked source snapshot)
 */
export async function packageArtifact(
  artifactPath: string,
  options: PackageOptions,
): Promise<{ filesCount: number; totalSize: number; fileEntries: FileEntry[] }> {
  // 1. Create a temporary staging directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-pkg-'));

  try {
    // 2. Copy source files first so we can compute counts and checksums
    const filesDir = path.join(tempDir, 'files');
    fs.mkdirSync(filesDir, { recursive: true });

    const fileEntries = copySourceFiles(
      filesDir,
      options.runConfig.working_directory,
      options.includeUntracked ?? false,
      options.excludePatterns ?? [],
      options.sourceStrategy,
    );

    const totalSize = fileEntries.reduce((sum, f) => sum + f.size, 0);

    // 3. Create manifest with actual file stats (immutable: don't mutate input)
    const manifestWithStats = {
      ...options.manifest,
      files_count: fileEntries.length,
      files_size_bytes: totalSize,
    };

    // 4. Build a sanitized RunConfig (strip secret values from environment)
    const sanitizedEnv: Record<string, string> = {};
    for (const [key, val] of Object.entries(options.runConfig.environment)) {
      if (options.secretKeys.includes(key)) {
        sanitizedEnv[key] = '<REDACTED>';
      } else {
        sanitizedEnv[key] = val;
      }
    }
    const safeRunConfig: RunConfig = { ...options.runConfig, environment: sanitizedEnv };

    // 5. Write JSON schema files
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifestWithStats, null, 2));
    fs.writeFileSync(path.join(tempDir, 'env.schema.json'), JSON.stringify(options.envSchema, null, 2));
    fs.writeFileSync(path.join(tempDir, 'metadata.json'), JSON.stringify(options.metadata, null, 2));
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify(safeRunConfig, null, 2));
    fs.writeFileSync(path.join(tempDir, 'failure.json'), JSON.stringify(options.failure, null, 2));

    // 6. Write file manifest with checksums
    fs.writeFileSync(path.join(tempDir, 'files.json'), JSON.stringify(fileEntries, null, 2));

    // 7. Write source strategy metadata
    if (options.sourceStrategy) {
      fs.writeFileSync(
        path.join(tempDir, 'source-strategy.json'),
        JSON.stringify({
          strategy: options.sourceStrategy.strategy,
          commit: options.sourceStrategy.commit,
          reason: options.sourceStrategy.reason,
        }, null, 2),
      );

      // Write git patch if available
      if (options.sourceStrategy.patch) {
        fs.writeFileSync(path.join(tempDir, 'changes.patch'), options.sourceStrategy.patch);
      }
    }

    // 8. Write environment snapshot
    if (options.envSnapshot) {
      fs.writeFileSync(
        path.join(tempDir, 'env-snapshot.json'),
        JSON.stringify(options.envSnapshot, null, 2),
      );
    }

    // 8b. Write language context
    if (options.languageContext) {
      fs.writeFileSync(
        path.join(tempDir, 'language-context.json'),
        JSON.stringify(options.languageContext, null, 2),
      );
    }

    // 9. Write logs
    const logsDir = path.join(tempDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'stdout.txt'), options.stdout);
    fs.writeFileSync(path.join(logsDir, 'stderr.txt'), options.stderr);
    fs.writeFileSync(
      path.join(logsDir, 'fingerprint.json'),
      JSON.stringify(
        {
          fingerprint: options.failure.fingerprint,
          error_patterns: options.failure.error_patterns,
        },
        null,
        2,
      ),
    );

    // 9b. Optionally sign the artifact (Phase 2.2: cryptographic provenance)
    if (options.signingKey) {
      const { payload } = buildSignedPayload({
        manifest: manifestWithStats,
        failure: options.failure,
        fileEntries,
      });
      const signature = signPayload(payload, options.signingKey, options.signer);
      fs.writeFileSync(path.join(tempDir, SIGNATURE_FILE), JSON.stringify(signature, null, 2));
    }

    // 10. Compress the temporary directory into the final .bug zip archive
    await zipDirectory(tempDir, artifactPath);

    return { filesCount: fileEntries.length, totalSize, fileEntries };
  } catch (err) {
    // Cleanup incomplete artifact on failure
    if (fs.existsSync(artifactPath)) {
      fs.rmSync(artifactPath, { force: true });
    }
    throw err;
  } finally {
    // Always clean up the temporary staging directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Copy git-tracked files into the artifact, computing SHA-256 checksums per file.
 */
function copySourceFiles(
  filesDir: string,
  workingDir: string,
  includeUntracked: boolean,
  excludePatterns: string[] = [],
  sourceStrategy?: SourceStrategyResult,
): FileEntry[] {
  let relativePaths: string[];

  if (sourceStrategy && sourceStrategy.filesToInclude.length > 0) {
    relativePaths = sourceStrategy.filesToInclude;
  } else {
    if (includeUntracked) {
      const trackedResult = spawnSync('git', ['ls-files'], { cwd: workingDir, encoding: 'utf-8' });
      const untrackedResult = spawnSync('git', ['ls-files', '-o', '--exclude-standard'], { cwd: workingDir, encoding: 'utf-8' });

      if (trackedResult.status === 0 && untrackedResult.status === 0) {
        const tracked = trackedResult.stdout.split('\n').map(f => f.trim()).filter(f => f.length > 0);
        const untracked = untrackedResult.stdout.split('\n').map(f => f.trim()).filter(f => f.length > 0);
        relativePaths = [...new Set([...tracked, ...untracked])];
      } else {
        const fallback = spawnSync('git', ['ls-files'], { cwd: workingDir, encoding: 'utf-8' });
        if (fallback.status !== 0) return [];
        relativePaths = fallback.stdout.split('\n').map(f => f.trim()).filter(f => f.length > 0);
      }
    } else {
      const result = spawnSync('git', ['ls-files'], { cwd: workingDir, encoding: 'utf-8' });
      if (result.status !== 0) return [];
      relativePaths = result.stdout.split('\n').map(f => f.trim()).filter(f => f.length > 0);
    }
  }

  // Apply --exclude patterns
  if (excludePatterns.length > 0) {
    relativePaths = filterByExcludePatterns(relativePaths, excludePatterns);
  }

  const entries: FileEntry[] = [];
  let runningSize = 0;

  for (const relPath of relativePaths) {
    const sourcePath = path.join(workingDir, relPath);
    if (!fs.existsSync(sourcePath)) continue;

    // Security: validate path stays within boundaries
    if (!isPathWithinBoundary(sourcePath, workingDir)) {
      process.stderr.write(`  Skipping ${relPath}: path traversal detected\n`);
      continue;
    }

    const stats = fs.statSync(sourcePath);
    if (!stats.isFile()) continue;

    runningSize += stats.size;

    if (runningSize > MAX_ARTIFACT_SIZE || entries.length >= MAX_FILE_COUNT) {
      process.stderr.write(
        `\n  [WARNING] Git-tracked files exceed hardware limits (100MB total or 10,000 files).\n` +
        `  Gracefully falling back to "stacktrace-only" mode. The bug artifact will\n` +
        `  contain the command, logs, and environment, but NO source files.\n` +
        `  The limit counts files that would be packaged (git-tracked + untracked),\n` +
        `  not the entire working tree.\n\n`
      );
      
      // Clean up partially copied files
      fs.rmSync(filesDir, { recursive: true, force: true });
      fs.mkdirSync(filesDir, { recursive: true });
      
      return [];
    }

    if (runningSize > WARN_THRESHOLD && entries.length > 0 && entries.length % 50 === 0) {
      process.stderr.write(
        `  Warning: artifact is ${(runningSize / 1024 / 1024).toFixed(1)} MB and growing...\n`,
      );
    }

    const targetPath = path.join(filesDir, relPath);

    // Security: validate target path stays within artifact boundary
    if (!isPathWithinBoundary(targetPath, filesDir)) {
      process.stderr.write(`  Skipping ${relPath}: target path escapes artifact\n`);
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);

    // Compute SHA-256 checksum
    const fileBuffer = fs.readFileSync(sourcePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    entries.push({
      path: relPath.replace(/\\/g, '/'), // normalize to forward slashes
      size: stats.size,
      sha256: hash,
    });
  }

  return entries;
}
