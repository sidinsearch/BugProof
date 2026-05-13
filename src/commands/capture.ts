import { Command } from 'commander';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { executeAndCapture } from '../capture/engine.js';
import { packageArtifact } from '../capture/packager.js';
import { scanEnvironmentForSecrets, buildEnvironmentSchema } from '../utils/secrets.js';
import { getGitContext } from '../utils/git.js';
import { formatCaptureJson } from '../utils/json-output.js';
import { RunConfig, ArtifactManifest, ArtifactMetadata } from '../types/artifact.js';
import { banner, section, success, warn, error, info, kvLine, c, icons } from '../utils/ui.js';
import { detectMissingDependencies } from '../utils/dependencies.js';
import {
  loadKeyPair,
  publicKeyFingerprint,
  resolvePrivateKey,
  DEFAULT_KEY_NAME,
} from '../utils/signing.js';
import { determineSourceStrategy } from '../capture/source-strategy.js';
import { captureEnvSnapshot } from '../capture/env-snapshot.js';
import { detectProjectLanguages } from '../capture/language-support.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')).version;

export const captureCommand = new Command('capture')
  .description('Capture a failing command as a .bug artifact')
  .allowUnknownOption(true)
  .option('--include-untracked', 'Include untracked files (git ls-files -o)')
  .option('--skip-secrets', "Don't scan for secrets; skip confirmation")
  .option('--timeout <ms>', 'Command timeout in milliseconds', '300000')
  .option('-n, --name <name>', 'Human-readable name for the artifact')
  .option('-d, --description <desc>', 'Description of the bug being captured')
  .option('-x, --exclude <pattern>', 'Exclude files matching glob pattern (repeatable)', (v: string, arr: string[]) => {
    arr.push(v);
    return arr;
  }, [] as string[])
  .option('--json', 'Output structured JSON instead of human-readable text')
  .option('--sign [key]', 'Cryptographically sign the artifact (Ed25519). Optional: named key or path to .key file')
  .option('--signer <identity>', 'Human-readable signer identity to embed (email, gist URL, etc.)')
  .argument('[command...]', 'The command to run and capture')
  .action(async (commandTokens: string[], options) => {
    const jsonMode = options.json === true;

    if (!commandTokens || commandTokens.length === 0) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: 'No command provided' }));
      } else {
        error('You must provide a command to capture.');
        info('Example: bugproof capture -- npm test');
      }
      process.exit(1);
    }

    if (!jsonMode) banner(`${icons.bug} BugProof Capture`);

    // 1. Detect secrets
    const secrets = options.skipSecrets
      ? { hasSecrets: false, detectedKeys: [] as string[] }
      : scanEnvironmentForSecrets(process.env);

    if (!jsonMode && secrets.hasSecrets) {
      warn(`Secrets detected in environment (will be redacted):`);
      for (const k of secrets.detectedKeys) {
        console.log(`    ${c.yellow(icons.dot)} ${k}`);
      }
      console.log();
    }

    // 2. Collect git context
    const git = getGitContext(process.cwd());
    if (!jsonMode) {
      if (git.commit) {
        info(`Git: ${c.cyan(git.branch || 'detached')} @ ${c.dim(git.commit.slice(0, 8))}${git.dirty ? c.yellow(' (dirty)') : ''}`);
      } else {
        warn('Not inside a git repository. Using smart file extraction from error output.');
      }
    }

    // 2b. Capture environment snapshot
    const envSnapshot = captureEnvSnapshot();

    // 2c. Detect project languages
    const langContext = detectProjectLanguages(process.cwd());

    // 3. Execute command
    if (!jsonMode) {
      info(`Running: ${c.bold(commandTokens.join(' '))}`);
      console.log();
    }

    const runConfig: RunConfig = {
      command: commandTokens,
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: parseInt(options.timeout, 10),
      capture_output: true,
    };

    const result = await executeAndCapture(runConfig);

    if (!jsonMode) {
      if (result.failure.timeout) {
        warn(`Command timed out after ${options.timeout}ms`);
      }

      const exitColor = result.failure.exit_code === 0 ? c.green : c.red;
      info(`Exit code: ${exitColor(String(result.failure.exit_code))}`);
      info(`Duration: ${c.dim(result.failure.duration_ms + 'ms')}`);

      if (result.failure.exit_code === 0) {
        warn('Command succeeded (exit 0). Capturing anyway, but replay verdict may report "not reproduced".');
      }
    }

    // 4. Build manifest
    const envSchema = buildEnvironmentSchema(process.env, secrets.detectedKeys);

    const artifactName = options.name
      ? options.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      : `bug_${Date.now()}`;

    const manifest: ArtifactManifest = {
      version: '1.0',
      bugproof_version: VERSION,
      name: artifactName,
      description: options.description || `Captured failure: ${commandTokens.join(' ')}`,
      captured_at: new Date().toISOString(),
      captured_on: {
        os: os.platform(),
        arch: os.arch(),
        node_version: process.version,
        git_commit: git.commit,
        git_branch: git.branch,
        git_dirty: git.dirty,
      },
      command: commandTokens,
      working_directory: runConfig.working_directory,
      exit_code: result.failure.exit_code,
      duration_ms: result.failure.duration_ms,
      files_count: 0,
      files_size_bytes: 0,
      secrets_detected: secrets.hasSecrets,
      secrets_skipped: secrets.detectedKeys,
    };

    const metadata: ArtifactMetadata = {
      capture_tool_version: VERSION,
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
        git_repo: git.repo,
        git_commit: git.commit,
        git_branch: git.branch,
        git_dirty: git.dirty,
        git_tags: git.tags,
      },
    };

    // 5. Determine source strategy
    const sourceStrategy = determineSourceStrategy({
      workingDir: process.cwd(),
      forceIncludeFiles: options.includeUntracked,
      excludePatterns: options.exclude,
    });

    if (sourceStrategy.shouldAbort) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: sourceStrategy.reason }));
      } else {
        console.log();
        error(sourceStrategy.reason);
        info('Tip: Initialize git to enable efficient bug recording:');
        console.log(`    ${c.cyan('git init && git add . && git commit -m "init"')}`);
      }
      process.exit(1);
    }

    if (!jsonMode) {
      console.log();
      info(`Source: ${c.dim(sourceStrategy.reason)}`);
    }

    // 6. Package artifact
    const artifactPath = path.join(process.cwd(), `${artifactName}.bug`);
    if (!jsonMode) {
      info('Packaging artifact...');
    }

    // Resolve signing key if --sign was passed
    let signingKey;
    let signerFingerprint: string | undefined;
    if (options.sign) {
      try {
        signingKey = options.sign === true
          ? loadKeyPair(DEFAULT_KEY_NAME)
          : resolvePrivateKey(String(options.sign));
        signerFingerprint = publicKeyFingerprint(signingKey.publicKey);
      } catch (err) {
        if (jsonMode) {
          console.log(JSON.stringify({ success: false, error: `Signing key error: ${(err as Error).message}` }));
        } else {
          error(`Signing key error: ${(err as Error).message}`);
          info(`Run ${c.cyan('bugproof keygen')} to create a default keypair.`);
        }
        process.exit(1);
      }
    }

    try {
      const packResult = await packageArtifact(artifactPath, {
        manifest,
        envSchema,
        runConfig,
        metadata,
        failure: result.failure,
        stdout: result.stdout,
        stderr: result.stderr,
        secretKeys: secrets.detectedKeys,
        includeUntracked: options.includeUntracked,
        excludePatterns: options.exclude,
        sourceStrategy,
        envSnapshot,
        languageContext: langContext,
        signingKey,
        signer: options.signer,
      });

      if (jsonMode) {
        console.log(formatCaptureJson({
          manifest,
          failure: result.failure,
          artifactPath,
          filesCount: packResult.filesCount,
          totalSize: packResult.totalSize,
        }));
      } else {
        console.log();
        success(c.bold('Artifact captured!'));
        if (signerFingerprint) {
          kvLine('Signed', `${c.green(icons.check)} fingerprint ${c.dim(signerFingerprint)}${options.signer ? ` (${options.signer})` : ''}`);
        }
        console.log();
        kvLine('Path', artifactPath);
        kvLine('Files', `${packResult.filesCount} files (${(packResult.totalSize / 1024).toFixed(1)} KB)`);
        kvLine('Exit code', String(result.failure.exit_code));
        kvLine('Fingerprint', c.dim(result.failure.fingerprint.slice(0, 24) + '...'));
        if (result.failure.error_patterns.length > 0) {
          kvLine('Patterns', result.failure.error_patterns.join(', '));
        }
        if (options.exclude.length > 0) {
          kvLine('Excluded', options.exclude.join(', '));
        }

        // Detect and show missing dependencies
        const deps = detectMissingDependencies(result.stderr);
        if (deps.length > 0) {
          console.log();
          section('Missing Dependencies');
          for (const dep of deps) {
            console.log(`    ${c.yellow(icons.arrow)} ${c.bold(dep.name)} (${dep.language})`);
            console.log(`      ${c.dim(dep.installCommand)}`);
          }
        }

        console.log();
        info(`Replay with: ${c.cyan(`bugproof replay ${artifactName}.bug`)}`);
        console.log();
      }
    } catch (err) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: String(err) }));
      } else {
        error(`Packaging failed: ${err}`);
      }
      process.exit(1);
    }
  });
