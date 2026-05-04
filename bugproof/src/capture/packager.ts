import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
import { filterByExcludePatterns } from '../utils/exclude';
import { ArtifactManifest, EnvSchema, RunConfig, ArtifactMetadata } from '../types/artifact';
import { FailureRecord } from '../types/failure';

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
}

export interface FileEntry {
  path: string;
  size: number;
  sha256: string;
}

const MAX_ARTIFACT_SIZE = 50 * 1024 * 1024; // 50MB hard limit per DESIGN.md
const WARN_THRESHOLD    = 10 * 1024 * 1024; // 10MB warning per DESIGN.md

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
  // 1. Create artifact directory
  fs.mkdirSync(artifactPath, { recursive: true });

  try {
    // 2. Copy source files first so we can compute counts and checksums
    const filesDir = path.join(artifactPath, 'files');
    fs.mkdirSync(filesDir, { recursive: true });

    const fileEntries = copySourceFiles(
      filesDir,
      options.runConfig.working_directory,
      options.includeUntracked ?? false,
      options.excludePatterns ?? [],
    );

    const totalSize = fileEntries.reduce((sum, f) => sum + f.size, 0);

    // 3. Update manifest with actual file stats
    options.manifest.files_count = fileEntries.length;
    options.manifest.files_size_bytes = totalSize;

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
    fs.writeFileSync(path.join(artifactPath, 'manifest.json'), JSON.stringify(options.manifest, null, 2));
    fs.writeFileSync(path.join(artifactPath, 'env.schema.json'), JSON.stringify(options.envSchema, null, 2));
    fs.writeFileSync(path.join(artifactPath, 'metadata.json'), JSON.stringify(options.metadata, null, 2));
    fs.writeFileSync(path.join(artifactPath, 'run.json'), JSON.stringify(safeRunConfig, null, 2));
    fs.writeFileSync(path.join(artifactPath, 'failure.json'), JSON.stringify(options.failure, null, 2));

    // 6. Write file manifest with checksums
    fs.writeFileSync(path.join(artifactPath, 'files.json'), JSON.stringify(fileEntries, null, 2));

    // 7. Write logs
    const logsDir = path.join(artifactPath, 'logs');
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

    return { filesCount: fileEntries.length, totalSize, fileEntries };
  } catch (err) {
    // Cleanup incomplete artifact on failure
    fs.rmSync(artifactPath, { recursive: true, force: true });
    throw err;
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
): FileEntry[] {
  const gitArgs = ['ls-files'];
  if (includeUntracked) {
    gitArgs.push('-o', '--exclude-standard');
  }

  const result = spawnSync('git', gitArgs, { cwd: workingDir, encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr}`);
  }

  let relativePaths = result.stdout
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  // Apply --exclude patterns
  if (excludePatterns.length > 0) {
    relativePaths = filterByExcludePatterns(relativePaths, excludePatterns);
  }

  const entries: FileEntry[] = [];
  let runningSize = 0;

  for (const relPath of relativePaths) {
    const sourcePath = path.join(workingDir, relPath);
    if (!fs.existsSync(sourcePath)) continue;

    const stats = fs.statSync(sourcePath);
    if (!stats.isFile()) continue;

    runningSize += stats.size;

    if (runningSize > MAX_ARTIFACT_SIZE) {
      throw new Error(
        `Artifact would exceed the 50 MB limit (currently ${(runningSize / 1024 / 1024).toFixed(1)} MB). ` +
          'Add large files to .gitignore or use --exclude patterns.',
      );
    }

    if (runningSize > WARN_THRESHOLD && entries.length > 0 && entries.length % 50 === 0) {
      process.stderr.write(
        `  Warning: artifact is ${(runningSize / 1024 / 1024).toFixed(1)} MB and growing...\n`,
      );
    }

    const targetPath = path.join(filesDir, relPath);
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
