import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { executeAndCapture } from '../capture/engine.js';
import { packageArtifact, buildCaptureManifest, buildCaptureMetadata } from '../capture/packager.js';
import { scanEnvironmentForSecrets, buildEnvironmentSchema } from '../utils/secrets.js';
import { getGitContext } from '../utils/git.js';
import { getBugProofVersion } from '../utils/version.js';
import { loadConfig, applyNameTemplate } from '../config/loader.js';
import { RunConfig } from '../types/artifact.js';
import { success, error, info, kvLine, c, Spinner } from '../utils/ui.js';

const VERSION = getBugProofVersion();

export const watchCommand = new Command('watch')
  .description('Run a command and auto-capture a .bug artifact if it fails')
  .option('--timeout <ms>', 'Command timeout in milliseconds')
  .option('-n, --name <name>', 'Human-readable name for the artifact')
  .option('-d, --description <desc>', 'Description of the bug being captured')
  .option('-o, --output <dir>', 'Output directory for artifacts')
  .option('--always', 'Capture even on success (default: only on failure)')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .argument('[command...]', 'The command to watch')
  .action(async (commandTokens: string[], options) => {
    const jsonMode = options.json === true;
    const config = loadConfig(process.cwd());

    if (!commandTokens || commandTokens.length === 0) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: 'No command provided' }));
      } else {
        error('You must provide a command to watch.');
        info('Example: bugproof watch -- npm test');
      }
      process.exit(1);
    }

    const timeout = parseInt(options.timeout, 10) || config.timeout;
    const outputDir = options.output || config.outputDir;

    // Execute the command
    const runConfig: RunConfig = {
      command: commandTokens,
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: timeout,
      capture_output: true,
    };

    const result = await executeAndCapture(runConfig);

    // Pass through stdout/stderr in real-time fashion
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    // If command succeeded and we're not in --always mode, just exit with same code
    if (result.failure.exit_code === 0 && !options.always) {
      process.exit(0);
    }

    // Command failed — auto-capture
    if (!jsonMode && result.failure.exit_code !== 0) {
      console.log();
      info(`${c.red('Command failed')} (exit ${result.failure.exit_code}) — auto-capturing artifact...`);
    }

    const secrets = config.skipSecrets
      ? { hasSecrets: false, detectedKeys: [] as string[] }
      : scanEnvironmentForSecrets(process.env);

    const git = getGitContext(process.cwd());
    const envSchema = buildEnvironmentSchema(process.env, secrets.detectedKeys);

    const artifactName = options.name
      ? options.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      : applyNameTemplate(config.nameTemplate, {
          timestamp: Date.now(),
          command: commandTokens[0],
          exit_code: result.failure.exit_code,
        });

    const manifest = buildCaptureManifest({
      name: artifactName,
      description: options.description || `Auto-captured failure: ${commandTokens.join(' ')}`,
      command: commandTokens,
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

    const artifactDir = path.resolve(outputDir);
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const artifactPath = path.join(artifactDir, `${artifactName}.bug`);

    let packSpinner: Spinner | undefined;
    if (!jsonMode) {
      packSpinner = new Spinner('Packaging artifact');
      packSpinner.start();
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
        includeUntracked: config.includeUntracked,
        excludePatterns: config.exclude,
      });

      if (jsonMode) {
        console.log(JSON.stringify({
          success: true,
          command_exit_code: result.failure.exit_code,
          captured: result.failure.exit_code !== 0 || options.always,
          artifact: { name: artifactName, path: artifactPath },
          failure: {
            exit_code: result.failure.exit_code,
            fingerprint: result.failure.fingerprint,
            error_patterns: result.failure.error_patterns,
          },
        }, null, 2));
      } else {
        packSpinner?.stop();
        console.log();
        success(`Artifact auto-captured: ${c.cyan(artifactPath)}`);
        kvLine('Files', `${packResult.filesCount} files (${(packResult.totalSize / 1024).toFixed(1)} KB)`);
        if (result.failure.error_patterns.length > 0) {
          kvLine('Error', result.failure.error_patterns.join(', '));
        }
        info(`Replay: ${c.cyan(`bugproof replay ${artifactName}.bug`)}`);
        console.log();
      }
    } catch (err) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: String(err) }));
      } else {
        packSpinner?.stop(`Auto-capture failed: ${err}`, true);
      }
    }

    process.exit(result.failure.exit_code);
  });