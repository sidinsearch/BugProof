import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { executeAndCapture } from '../capture/engine.js';
import { packageArtifact, buildCaptureManifest, buildCaptureMetadata } from '../capture/packager.js';
import { scanEnvironmentForSecrets, buildEnvironmentSchema } from '../utils/secrets.js';
import { getGitContext, findUntrackedCommandFiles } from '../utils/git.js';
import { getBugProofVersion } from '../utils/version.js';
import { formatCaptureJson } from '../utils/json-output.js';
import { RunConfig } from '../types/artifact.js';
import { banner, section, warn, error, info, kvIcon, c, icons, summaryBox, renderLogo } from '../utils/ui.js';
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
import { createContainer } from '../sandbox/container.js';
import { loadConfig, applyNameTemplate } from '../config/loader.js';

const VERSION = getBugProofVersion();

export const captureCommand = new Command('capture')
  .description('Capture a failing command as a .bug artifact')
  .allowUnknownOption(true)
  .passThroughOptions()
  .option('--include-untracked', 'Include untracked files (git ls-files -o)')
  .option('--skip-secrets', "Don't scan for secrets; skip confirmation")
  .option('--timeout <ms>', 'Command timeout in milliseconds', '300000')
  .option('-n, --name <name>', 'Human-readable name for the artifact')
  .option('-d, --description <desc>', 'Description of the bug being captured')
  .option('-o, --output <dir>', 'Output directory for the artifact (default: current directory)')
  .option('-x, --exclude <pattern>', 'Exclude files matching glob pattern (repeatable)', (v: string, arr: string[]) => {
    arr.push(v);
    return arr;
  }, [] as string[])
  .option('--json', 'Output structured JSON instead of human-readable text')
  .option('--container', 'Run the command in a BugBox container (lightweight process isolation)')
  .option('--sign [key]', 'Cryptographically sign the artifact (Ed25519). Optional: named key or path to .key file')
  .option('--signer <identity>', 'Human-readable signer identity to embed (email, gist URL, etc.)')
  .argument('[command...]', 'The command to run and capture')
  .action(async (commandTokens: string[], options) => {
    const jsonMode = options.json === true;

    // Fix: manually extract command tokens after '--' to avoid flag collision
    // (e.g., 'gcc -o output input.c' where -o would be parsed as --output)
    const rawArgs = process.argv.slice(3); // skip 'node', 'cli.js', 'capture'
    const dashDashIndex = rawArgs.indexOf('--');
    let effectiveCommandTokens = commandTokens;
    let outputOverriddenByCommand = false;
    if (dashDashIndex >= 0) {
      effectiveCommandTokens = rawArgs.slice(dashDashIndex + 1);
      // If -o/--output appeared after '--', it was part of the captured command, not a BugProof option
      // Check if any -o/--output tokens exist after '--'
      const afterDashDash = rawArgs.slice(dashDashIndex + 1);
      outputOverriddenByCommand = afterDashDash.some(arg => arg === '-o' || arg.startsWith('--output'));
    }

    if (!effectiveCommandTokens || effectiveCommandTokens.length === 0) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: 'No command provided' }));
      } else {
        error('You must provide a command to capture.');
        info('Example: bugproof capture -- npm test');
      }
      process.exit(1);
    }

    // Load .bugproofrc config
    const config = loadConfig(process.cwd());

    // Resolve output directory: flag > config.outputDir > current directory
    // If -o appeared after '--', it was part of the captured command — ignore it
    const outputDir = (options.output && !outputOverriddenByCommand)
      ? path.resolve(options.output)
      : path.resolve(config.outputDir);

    if (!jsonMode) {
      await renderLogo();
      banner('Capture');
    }

    // 1. Detect secrets
    const secrets = options.skipSecrets
      ? { hasSecrets: false, detectedKeys: [] as string[] }
      : scanEnvironmentForSecrets(process.env);

    if (!jsonMode && secrets.hasSecrets) {
      warn(`Secrets detected in environment (will be redacted)`);
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
    let effectiveCommand = effectiveCommandTokens;
    let containerCleanup = () => {};

    if (options.container) {
      if (!jsonMode) {
        info(`Running in BugBox container: ${c.bold(effectiveCommandTokens.join(' '))}`);
      }
      const container = createContainer({
        command: effectiveCommandTokens,
        workingDir: process.cwd(),
        environment: process.env as Record<string, string>,
        timeoutMs: parseInt(options.timeout, 10),
        network: 'none',
        filesystem: 'readonly',
      });
      effectiveCommand = container.command;
      containerCleanup = container.cleanup;
      if (!jsonMode) {
        info(`Container: ${c.dim(container.description)}`);
        if (container.layersFailed.length > 0) {
          warn(`Container layers failed: ${container.layersFailed.join(', ')}`);
        }
      }
    } else if (!jsonMode) {
      info(`Running: ${c.bold(effectiveCommandTokens.join(' '))}`);
    }

    if (!jsonMode) console.log();

    const runConfig: RunConfig = {
      command: effectiveCommand,
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: parseInt(options.timeout, 10),
      capture_output: true,
    };

    const result = await executeAndCapture(runConfig);
    containerCleanup();

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

    // 4. Build manifest and metadata
    const envSchema = buildEnvironmentSchema(process.env, secrets.detectedKeys);

    // Resolve artifact name: flag > config nameTemplate > default
    let artifactName: string;
    if (options.name) {
      artifactName = options.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    } else if (config.nameTemplate && config.nameTemplate !== 'bug_{timestamp}') {
      // Use config template if it's customized
      artifactName = applyNameTemplate(config.nameTemplate, {
        timestamp: Date.now(),
        command: effectiveCommandTokens[0] || 'unknown',
        exit_code: result.failure.exit_code,
      }).replace(/[^a-zA-Z0-9_-]/g, '_');
    } else {
      artifactName = `bug_${Date.now()}`;
    }

    const manifest = buildCaptureManifest({
      name: artifactName,
      description: options.description || `Captured failure: ${effectiveCommandTokens.join(' ')}`,
      command: effectiveCommandTokens,
      workingDirectory: runConfig.working_directory,
      exitCode: result.failure.exit_code,
      durationMs: result.failure.duration_ms,
      gitCommit: git.commit,
      gitBranch: git.branch,
      gitDirty: git.dirty,
      secretsDetected: secrets.hasSecrets,
      secretsSkipped: secrets.detectedKeys,
      bugproofVersion: VERSION,
    });

    const metadata = buildCaptureMetadata({
      bugproofVersion: VERSION,
      gitRepo: git.repo,
      gitCommit: git.commit,
      gitBranch: git.branch,
      gitDirty: git.dirty,
      gitTags: git.tags,
    });

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

    // 5b. Warn about untracked files referenced in the command
    if (git.commit && git.dirty && !options.includeUntracked && !jsonMode) {
      const untrackedFiles = findUntrackedCommandFiles(effectiveCommandTokens, process.cwd());
      if (untrackedFiles.length > 0) {
        warn(`Command references untracked file(s): ${untrackedFiles.join(', ')}`);
        info(`Replay may fail unless these files are present. Use ${c.cyan('--include-untracked')} to bundle them.`);
      }
    }

    // 6. Package artifact
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const artifactPath = path.join(outputDir, `${artifactName}.bug`);
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
        summaryBox('Artifact Captured', [
          { label: 'Path', value: artifactPath, highlight: true },
          { label: 'Files', value: `${packResult.filesCount} files (${(packResult.totalSize / 1024).toFixed(1)} KB)` },
          { label: 'Exit code', value: String(result.failure.exit_code) },
          { label: 'Fingerprint', value: c.dim(result.failure.fingerprint.slice(0, 24) + '...') },
          ...(signerFingerprint ? [{ label: 'Signed', value: `${c.green(icons.check)} fingerprint ${c.dim(signerFingerprint)}${options.signer ? ` (${options.signer})` : ''}` }] : []),
          ...(result.failure.error_patterns.length > 0 ? [{ label: 'Patterns', value: result.failure.error_patterns.join(', ') }] : []),
          ...(options.exclude.length > 0 ? [{ label: 'Excluded', value: options.exclude.join(', ') }] : []),
          ...(outputDir !== process.cwd() ? [{ label: 'Output dir', value: outputDir }] : []),
        ]);

        // Detect and show missing dependencies
        const deps = detectMissingDependencies(result.stderr);
        if (deps.length > 0) {
          section('Missing Dependencies');
          for (const dep of deps) {
            kvIcon(c.yellow(icons.arrow), c.bold(dep.name), `${c.dim(dep.language)} — ${c.dim(dep.installCommand)}`);
          }
        }

        console.log();
        info(`Replay with: ${c.cyan(`bugproof replay ${artifactName}.bug`)}`);
        if (outputDir !== process.cwd()) {
          info(`Output directory set via ${options.output ? '-o flag' : '.bugproofrc outputDir'}`);
        }
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
