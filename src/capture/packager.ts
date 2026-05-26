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

/** Compiled language artifact extensions to include */
const COMPILED_EXTENSIONS = new Set([
  '.class',    // Java
  '.jar',      // Java archives
  '.war',      // Java web archives
  '.ear',      // Java enterprise archives
  '.pyc',      // Python bytecode
  '.pyo',      // Python optimized bytecode
  '.wasm',     // WebAssembly
  '.node',     // Node.js native addons
]);

/** Common build directories to scan for compiled artifacts */
const BUILD_DIRS = [
  'target',        // Maven/Gradle
  'build',         // Gradle/CMake
  'out',           // IntelliJ/VS
  'bin',           // .NET/C#
  'dist',          // Various
  '__pycache__',   // Python
  '.next',         // Next.js
  '.nuxt',         // Nuxt.js
];

export interface BuildManifestOptions {
  name: string;
  description: string;
  command: string[];
  workingDirectory: string;
  exitCode: number;
  durationMs: number;
  gitCommit?: string;
  gitBranch?: string;
  gitDirty?: boolean;
  secretsDetected: boolean;
  secretsSkipped: string[];
  bugproofVersion: string;
}

export function buildCaptureManifest(opts: BuildManifestOptions): ArtifactManifest {
  return {
    version: '1.0',
    bugproof_version: opts.bugproofVersion,
    name: opts.name,
    description: opts.description,
    captured_at: new Date().toISOString(),
    captured_on: {
      os: os.platform(),
      arch: os.arch(),
      node_version: process.version,
      git_commit: opts.gitCommit,
      git_branch: opts.gitBranch,
      git_dirty: opts.gitDirty,
    },
    command: opts.command,
    working_directory: opts.workingDirectory,
    exit_code: opts.exitCode,
    duration_ms: opts.durationMs,
    files_count: 0,
    files_size_bytes: 0,
    secrets_detected: opts.secretsDetected,
    secrets_skipped: opts.secretsSkipped,
  };
}

export interface BuildMetadataOptions {
  bugproofVersion: string;
  gitRepo?: string;
  gitCommit?: string;
  gitBranch?: string;
  gitDirty?: boolean;
  gitTags?: string[];
}

export function buildCaptureMetadata(opts: BuildMetadataOptions): ArtifactMetadata {
  return {
    capture_tool_version: opts.bugproofVersion,
    captured_at: new Date().toISOString(),
    captured_by: os.userInfo().username,
    captured_platform: {
      os: os.platform(),
      os_version: os.release(),
      arch: os.arch(),
      cpu_count: os.cpus().length,
      memory_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    },
    project_context: {
      git_repo: opts.gitRepo,
      git_commit: opts.gitCommit,
      git_branch: opts.gitBranch,
      git_dirty: opts.gitDirty,
      git_tags: opts.gitTags,
    },
  };
}

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
  /** Maximum artifact size in MB (default: 100) */
  maxArtifactSizeMB?: number;
  /** Override the hardware limit and include all source files */
  forceInclude?: boolean;
  /** Include compiled language artifacts (.class, .jar, .pyc, etc.) */
  includeCompiled?: boolean;
}

export interface FileEntry {
  path: string;
  size: number;
  sha256: string;
}

const MAX_FILE_COUNT = 10000; // 10k files hard limit

/**
 * Packages the artifact into the .bug directory format specified in design-spec.md.
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
      options.maxArtifactSizeMB ?? 100,
      options.forceInclude ?? false,
      options.includeCompiled ?? false,
      options.languageContext,
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
  maxArtifactSizeMB = 100,
  forceInclude = false,
  includeCompiled = false,
  languageContext?: ProjectLanguageContext,
): FileEntry[] {
  const maxArtifactSize = maxArtifactSizeMB * 1024 * 1024;
  const warnThreshold = maxArtifactSize;
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

  // Include compiled artifacts if:
  // 1. User explicitly requested via --include-compiled, OR
  // 2. Auto-detected compiled language with present build artifacts
  const shouldIncludeCompiled = includeCompiled || autoDetectCompiledLanguages(workingDir, languageContext);
  if (shouldIncludeCompiled) {
    const compiledPaths = findCompiledArtifacts(workingDir);
    relativePaths = [...new Set([...relativePaths, ...compiledPaths])];
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

    if (!forceInclude && (runningSize > maxArtifactSize || entries.length >= MAX_FILE_COUNT)) {
      process.stderr.write(
        `\n  [WARNING] Git-tracked files exceed hardware limits (${maxArtifactSizeMB}MB total or 10,000 files).\n` +
        `  Gracefully falling back to "stacktrace-only" mode. The bug artifact will\n` +
        `  contain the command, logs, and environment, but NO source files.\n` +
        `  The limit counts files that would be packaged (git-tracked + untracked),\n` +
        `  not the entire working tree.\n` +
        `  Use --force-include to override this limit.\n\n`
      );
      
      // Clean up partially copied files
      fs.rmSync(filesDir, { recursive: true, force: true });
      fs.mkdirSync(filesDir, { recursive: true });
      
      return [];
    }

    if (forceInclude && runningSize > maxArtifactSize && entries.length > 0 && entries.length % 100 === 0) {
      process.stderr.write(
        `  Warning (--force-include): artifact is ${(runningSize / 1024 / 1024).toFixed(1)} MB and growing...\n`,
      );
    } else if (runningSize > warnThreshold && entries.length > 0 && entries.length % 50 === 0) {
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

/**
 * Find compiled language artifacts in common build directories and project root.
 */
function findCompiledArtifacts(workingDir: string): string[] {
  const compiled: string[] = [];
  const maxIndividualSize = 50 * 1024 * 1024; // 50MB per file

  function scanDir(dir: string, relativeBase: string, scanSubDirs: boolean): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      const relPath = relativeBase ? `${relativeBase}/${name}` : name;

      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        // Scan build directories and their contents
        if (BUILD_DIRS.includes(name)) {
          scanDir(path.join(dir, name), relPath, true);
        } else if (scanSubDirs) {
          // Recurse into subdirectories of build dirs
          scanDir(path.join(dir, name), relPath, true);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(name).toLowerCase();
        if (COMPILED_EXTENSIONS.has(ext)) {
          try {
            const stat = fs.statSync(path.join(dir, name));
            if (stat.size <= maxIndividualSize) {
              compiled.push(relPath);
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  // Scan project root for compiled files alongside source
  scanDir(workingDir, '', false);

  // Scan build directories recursively
  for (const buildDir of BUILD_DIRS) {
    const dirPath = path.join(workingDir, buildDir);
    if (fs.existsSync(dirPath)) {
      scanDir(dirPath, buildDir, true);
    }
  }

  return compiled;
}

/**
 * Auto-detect if the project uses compiled languages and has build artifacts present.
 * Returns true if compiled artifacts should be included automatically.
 *
 * Supported compiled languages (auto-detected):
 * - Java: .java source + target/, build/, out/ with .class/.jar files
 * - Python: .py source + __pycache__/ with .pyc/.pyo files
 * - Go: go.mod + bin/, dist/ with compiled binaries (detected by extension)
 * - Rust: Cargo.toml + target/ with compiled binaries
 * - .NET/C#: .csproj/.sln + bin/, obj/ with .dll/.exe files
 * - WebAssembly: .wasm files in any build directory
 * - Node native addons: .node files in build/, dist/, node_modules/
 *
 * NOT auto-included (platform-specific binaries, source-only replay):
 * - C/C++: .o, .obj, .exe — these are platform-specific and won't replay cross-platform
 * - Swift, Kotlin/Native, etc.
 */
function autoDetectCompiledLanguages(workingDir: string, languageContext?: ProjectLanguageContext): boolean {
  if (!languageContext || languageContext.languages.length === 0) {
    return findCompiledArtifacts(workingDir).length > 0;
  }

  const compiledLanguageIds = new Set(['java', 'python', 'go', 'rust', 'dotnet', 'typescript']);
  const hasCompiledLanguage = languageContext.languages.some(lang => compiledLanguageIds.has(lang.id));

  if (!hasCompiledLanguage) {
    const wasmOrNode = findCompiledArtifacts(workingDir).some(p =>
      p.endsWith('.wasm') || p.endsWith('.node')
    );
    return wasmOrNode;
  }

  const compiledArtifacts = findCompiledArtifacts(workingDir);
  return compiledArtifacts.length > 0;
}
