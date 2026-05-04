import { Command } from 'commander';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { executeAndCapture } from './capture/engine.js';
import { packageArtifact } from './capture/packager.js';
import { scanEnvironmentForSecrets, buildEnvironmentSchema } from './utils/secrets.js';
import { getGitContext } from './utils/git.js';
import { filterByExcludePatterns } from './utils/exclude.js';
import { formatCaptureJson, formatReplayJson, formatInspectJson } from './utils/json-output.js';
import { diffArtifacts, ArtifactSnapshot } from './diff/engine.js';
import { RunConfig, ArtifactManifest, ArtifactMetadata } from './types/artifact.js';
import { replayArtifact } from './replay/engine.js';
import { generateVerdict } from './replay/verdict.js';
import { banner, success, warn, error, info, kvLine, c, icons } from './utils/ui.js';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('bugproof')
  .description('Executable bug artifacts \u2014 portable, reproducible bug reports')
  .version(VERSION);

// ─── CAPTURE ─────────────────────────────────────────────────────────────────

program
  .command('capture')
  .description('Capture a failing command as a .bug artifact')
  .option('--include-untracked', 'Include untracked files (git ls-files -o)')
  .option('--skip-secrets', "Don't scan for secrets; skip confirmation")
  .option('--timeout <ms>', 'Command timeout in milliseconds', '300000')
  .option('-n, --name <name>', 'Human-readable name for the artifact')
  .option('-d, --description <desc>', 'Description of the bug being captured')
  .option('-e, --exclude <pattern>', 'Exclude files matching glob pattern (repeatable)', (v: string, arr: string[]) => {
    arr.push(v);
    return arr;
  }, [] as string[])
  .option('--json', 'Output structured JSON instead of human-readable text')
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
        warn('Not inside a git repository. File capture will be skipped.');
      }
    }

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

    // 5. Package artifact
    const artifactPath = path.join(process.cwd(), `${artifactName}.bug`);
    if (!jsonMode) {
      console.log();
      info('Packaging artifact...');
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

// ─── REPLAY ──────────────────────────────────────────────────────────────────

program
  .command('replay')
  .description('Replay a .bug artifact to reproduce a failure')
  .argument('<artifact>', 'Path to the .bug artifact directory')
  .option('--version-match <mode>', 'Git checkout mode: strict, current, branch', 'current')
  .option('--env <var=value>', 'Override environment variables', (v: string, arr: string[]) => {
    arr.push(v);
    return arr;
  }, [] as string[])
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action(async (artifact: string, options) => {
    const jsonMode = options.json === true;

    if (!fs.existsSync(artifact)) {
      if (jsonMode) {
        console.log(JSON.stringify({ reproduced: false, error: `Artifact not found: ${artifact}` }));
      } else {
        error(`Artifact not found at ${artifact}`);
      }
      process.exit(1);
    }

    if (!jsonMode) banner(`${icons.arrow} BugProof Replay`);

    const manifestRaw = fs.readFileSync(path.join(artifact, 'manifest.json'), 'utf-8');
    const manifest: ArtifactManifest = JSON.parse(manifestRaw);

    if (!jsonMode) {
      kvLine('Artifact', manifest.name);
      kvLine('Captured', manifest.captured_at);
      kvLine('Command', manifest.command.join(' '));
      kvLine('Platform', `${manifest.captured_on.os}/${manifest.captured_on.arch}`);
      if (manifest.captured_on.git_commit) {
        kvLine('Git', `${manifest.captured_on.git_branch || '?'} @ ${manifest.captured_on.git_commit.slice(0, 8)}`);
      }
      console.log();
    }

    const runConfig: RunConfig = JSON.parse(fs.readFileSync(path.join(artifact, 'run.json'), 'utf-8'));
    const expectedFailure = JSON.parse(fs.readFileSync(path.join(artifact, 'failure.json'), 'utf-8'));

    const envOverrides: Record<string, string> = {};
    for (const entry of options.env) {
      const eq = entry.indexOf('=');
      if (eq > 0) {
        envOverrides[entry.slice(0, eq)] = entry.slice(eq + 1);
      }
    }

    if (!jsonMode) {
      info('Replaying command...');
      console.log();
    }

    const replayResult = await replayArtifact(runConfig, expectedFailure, {
      artifactPath: artifact,
      versionMatch: options.versionMatch,
      envOverrides,
    });

    const verdict = generateVerdict(replayResult);

    if (jsonMode) {
      console.log(formatReplayJson({
        verdict,
        expectedExitCode: expectedFailure.exit_code,
        actualExitCode: replayResult.actualFailure.exit_code,
        artifactName: manifest.name,
      }));
    } else {
      console.log();
      if (verdict.status === 'confirmed') {
        success(c.bold(c.green('REPRODUCTION CONFIRMED')));
      } else {
        error(c.bold(c.red('NOT REPRODUCED')));
      }
      console.log();
      kvLine('Expected exit', String(expectedFailure.exit_code));
      kvLine('Actual exit', String(replayResult.actualFailure.exit_code));
      kvLine('Verdict', verdict.message);
      console.log();
    }

    process.exit(verdict.status === 'confirmed' ? 0 : 1);
  });

// ─── INSPECT ─────────────────────────────────────────────────────────────────

program
  .command('inspect')
  .description('Inspect the contents of a .bug artifact')
  .argument('<artifact>', 'Path to the .bug artifact directory')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action((artifact: string, options) => {
    const jsonMode = options.json === true;

    if (!fs.existsSync(artifact)) {
      if (jsonMode) {
        console.log(JSON.stringify({ error: `Artifact not found: ${artifact}` }));
      } else {
        error(`Artifact not found at ${artifact}`);
      }
      process.exit(1);
    }

    const manifest: ArtifactManifest = JSON.parse(
      fs.readFileSync(path.join(artifact, 'manifest.json'), 'utf-8'),
    );
    const failure = JSON.parse(fs.readFileSync(path.join(artifact, 'failure.json'), 'utf-8'));

    // Read file entries
    const filesJsonPath = path.join(artifact, 'files.json');
    const files = fs.existsSync(filesJsonPath) ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf-8')) : [];

    if (jsonMode) {
      console.log(formatInspectJson({ manifest, failure, files }));
      return;
    }

    banner(`${icons.box} BugProof Inspect`);

    // Manifest
    console.log(c.bold('  Manifest'));
    kvLine('Name', manifest.name);
    kvLine('Description', manifest.description);
    kvLine('Version', `${manifest.bugproof_version} (format ${manifest.version})`);
    kvLine('Captured', manifest.captured_at);
    kvLine('Command', manifest.command.join(' '));
    kvLine('Working dir', manifest.working_directory);
    kvLine('Platform', `${manifest.captured_on.os}/${manifest.captured_on.arch} (Node ${manifest.captured_on.node_version})`);

    if (manifest.captured_on.git_commit) {
      kvLine('Git commit', manifest.captured_on.git_commit);
      kvLine('Git branch', manifest.captured_on.git_branch || 'n/a');
      kvLine('Git dirty', manifest.captured_on.git_dirty ? 'yes' : 'no');
    }

    console.log();

    // Failure
    console.log(c.bold('  Failure'));
    kvLine('Exit code', String(failure.exit_code));
    kvLine('Signal', failure.signal || 'none');
    kvLine('Duration', `${failure.duration_ms}ms`);
    kvLine('Timeout', failure.timeout ? 'yes' : 'no');
    kvLine('Fingerprint', failure.fingerprint);
    kvLine('Patterns', failure.error_patterns?.join(', ') || 'none');
    kvLine('Stdout lines', String(failure.stdout_lines));
    kvLine('Stderr lines', String(failure.stderr_lines));

    console.log();

    // Stderr snippet
    if (failure.stderr_snippet) {
      console.log(c.bold('  Stderr (last 5 lines)'));
      console.log(c.dim('  ' + '\u2500'.repeat(38)));
      for (const line of failure.stderr_snippet.split('\n')) {
        console.log(`  ${c.red(line)}`);
      }
      console.log(c.dim('  ' + '\u2500'.repeat(38)));
    }

    console.log();

    // Files summary
    if (files.length > 0) {
      console.log(c.bold(`  Files (${files.length} captured)`));
      const shown = files.slice(0, 15);
      for (const f of shown) {
        const sizeKB = (f.size / 1024).toFixed(1);
        console.log(`    ${c.dim(sizeKB.padStart(8) + ' KB')}  ${f.path}`);
      }
      if (files.length > 15) {
        console.log(c.dim(`    ... and ${files.length - 15} more`));
      }
    } else {
      kvLine('Files', `${manifest.files_count} (${(manifest.files_size_bytes / 1024).toFixed(1)} KB)`);
    }

    // Secrets
    if (manifest.secrets_detected) {
      console.log();
      console.log(c.bold('  Secrets (redacted)'));
      for (const s of manifest.secrets_skipped) {
        console.log(`    ${c.yellow(icons.dot)} ${s}`);
      }
    }

    console.log();
  });

// ─── DIFF ────────────────────────────────────────────────────────────────────

program
  .command('diff')
  .description('Compare two .bug artifacts side by side')
  .argument('<left>', 'Path to the first .bug artifact')
  .argument('<right>', 'Path to the second .bug artifact')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action((leftPath: string, rightPath: string, options) => {
    const jsonMode = options.json === true;

    for (const [label, p] of [['Left', leftPath], ['Right', rightPath]] as const) {
      if (!fs.existsSync(p)) {
        if (jsonMode) {
          console.log(JSON.stringify({ error: `${label} artifact not found: ${p}` }));
        } else {
          error(`${label} artifact not found at ${p}`);
        }
        process.exit(1);
      }
    }

    const loadSnapshot = (artifactDir: string): ArtifactSnapshot => {
      const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, 'manifest.json'), 'utf-8'));
      const failure = JSON.parse(fs.readFileSync(path.join(artifactDir, 'failure.json'), 'utf-8'));
      const filesJsonPath = path.join(artifactDir, 'files.json');
      const files = fs.existsSync(filesJsonPath) ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf-8')) : [];
      return { manifest, failure, files };
    };

    const left = loadSnapshot(leftPath);
    const right = loadSnapshot(rightPath);
    const result = diffArtifacts(left, right);

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    banner(`${icons.box} BugProof Diff`);

    kvLine('Left', left.manifest.name);
    kvLine('Right', right.manifest.name);
    console.log();

    if (result.identical) {
      success('Artifacts are identical.');
      console.log();
      return;
    }

    // Property changes
    if (result.changes.length > 0) {
      console.log(c.bold('  Property Changes'));
      for (const ch of result.changes) {
        console.log(`    ${c.yellow(ch.field)}`);
        console.log(`      ${c.red('- ' + String(ch.left))}`);
        console.log(`      ${c.green('+ ' + String(ch.right))}`);
      }
      console.log();
    }

    // File changes
    if (result.fileChanges) {
      const fc = result.fileChanges;
      const hasChanges = fc.added.length > 0 || fc.removed.length > 0 || fc.modified.length > 0;
      if (hasChanges) {
        console.log(c.bold('  File Changes'));
        for (const f of fc.added) {
          console.log(`    ${c.green('+ ' + f)}`);
        }
        for (const f of fc.removed) {
          console.log(`    ${c.red('- ' + f)}`);
        }
        for (const f of fc.modified) {
          console.log(`    ${c.yellow('~ ' + f)}`);
        }
        console.log();
      }
    }

    info(`${result.changes.length} property changes, ${(result.fileChanges?.added.length || 0) + (result.fileChanges?.removed.length || 0) + (result.fileChanges?.modified.length || 0)} file changes.`);
    console.log();
  });

program.parse(process.argv);
