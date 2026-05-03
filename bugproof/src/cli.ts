import { Command } from 'commander';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { executeAndCapture } from './capture/engine';
import { packageArtifact } from './capture/packager';
import { scanEnvironmentForSecrets, buildEnvironmentSchema } from './utils/secrets';
import { RunConfig, ArtifactManifest, ArtifactMetadata, EnvSchema } from './types/artifact';
import { replayArtifact } from './replay/engine';
import { generateVerdict } from './replay/verdict';

const program = new Command();

program
  .name('bugproof')
  .description('Executable bug artifacts — portable, reproducible bug reports')
  .version('0.1.0');

program
  .command('capture')
  .description('Capture a failing command as a .bug artifact')
  .option('--include-untracked', 'Include untracked files (git ls-files -o)')
  .option('--skip-secrets', "Don't scan for secrets; skip confirmation")
  .argument('[command...]', 'The command to run and capture')
  .action(async (commandTokens, options) => {
    if (!commandTokens || commandTokens.length === 0) {
      console.error('Error: You must provide a command to capture. Example: bugproof capture -- npm test');
      process.exit(1);
    }

    const runConfig: RunConfig = {
      command: commandTokens,
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 300000, // 5 min default
      capture_output: true
    };

    const secrets = options.skipSecrets ? { hasSecrets: false, detectedKeys: [] } : scanEnvironmentForSecrets(process.env);
    if (secrets.hasSecrets) {
      console.warn(`WARNING: Potential secrets detected in environment: ${secrets.detectedKeys.join(', ')}`);
      // In a real CLI, we'd prompt here. For v0.1 we just strip them from the schema explicitly.
    }

    console.log(`Executing: ${commandTokens.join(' ')}`);
    const result = await executeAndCapture(runConfig);
    
    console.log(`Command finished with exit code ${result.failure.exit_code}`);
    
    const envSchema = buildEnvironmentSchema(process.env, secrets.detectedKeys);
    
    const manifest: ArtifactManifest = {
      version: '1.0',
      bugproof_version: '0.1.0',
      name: `BugProof_${Date.now()}`,
      description: `Captured failure of ${commandTokens[0]}`,
      captured_at: new Date().toISOString(),
      captured_on: {
        os: os.platform(),
        arch: os.arch(),
        node_version: process.version
      },
      command: commandTokens,
      working_directory: runConfig.working_directory,
      exit_code: result.failure.exit_code,
      duration_ms: result.failure.duration_ms,
      files_count: 0, // Filled by packager
      files_size_bytes: 0,
      secrets_detected: secrets.hasSecrets,
      secrets_skipped: secrets.detectedKeys
    };

    const metadata: ArtifactMetadata = {
      capture_tool_version: '0.1.0',
      captured_at: new Date().toISOString(),
      captured_by: os.userInfo().username,
      captured_platform: {
        os: os.platform(),
        os_version: os.release(),
        arch: os.arch(),
        cpu_count: os.cpus().length,
        memory_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024)
      },
      project_context: {}
    };

    const artifactName = `bug_${Date.now()}.bug`;
    const artifactPath = path.join(process.cwd(), artifactName);
    
    await packageArtifact(artifactPath, {
      manifest,
      envSchema,
      runConfig,
      metadata,
      failure: result.failure,
      stdout: result.stdout,
      stderr: result.stderr,
      includeUntracked: options.includeUntracked
    });

    console.log(`Artifact captured successfully at: ${artifactPath}`);
  });

program
  .command('replay')
  .description('Replay a .bug artifact to reproduce a failure')
  .argument('<artifact>', 'Path to the .bug artifact directory')
  .action(async (artifact) => {
    if (!fs.existsSync(artifact)) {
      console.error(`Error: Artifact not found at ${artifact}`);
      process.exit(1);
    }
    
    const runConfig: RunConfig = JSON.parse(fs.readFileSync(path.join(artifact, 'run.json'), 'utf-8'));
    const expectedFailure = JSON.parse(fs.readFileSync(path.join(artifact, 'failure.json'), 'utf-8'));
    
    console.log(`Replaying artifact...`);
    const replayResult = await replayArtifact(runConfig, expectedFailure, {
      artifactPath: artifact,
      versionMatch: 'current',
      envOverrides: {}
    });

    console.log(`Replay finished with exit code ${replayResult.actualFailure.exit_code}`);
    
    const verdict = generateVerdict(replayResult);
    
    console.log(`Verdict: ${verdict.status.toUpperCase()}`);
    console.log(`> ${verdict.message}`);
    
    if (verdict.status === 'confirmed') {
      process.exit(0);
    } else {
      process.exit(1);
    }
  });

program.parse(process.argv);
