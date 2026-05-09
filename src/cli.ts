#!/usr/bin/env node
import { Command } from 'commander';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { executeAndCapture } from './capture/engine.js';
import { packageArtifact } from './capture/packager.js';
import { scanEnvironmentForSecrets, buildEnvironmentSchema } from './utils/secrets.js';
import { getGitContext } from './utils/git.js';
import { formatCaptureJson, formatReplayJson, formatInspectJson } from './utils/json-output.js';
import { extractZip } from './utils/archive.js';
import { diffArtifacts, ArtifactSnapshot } from './diff/engine.js';
import { RunConfig, ArtifactManifest, ArtifactMetadata } from './types/artifact.js';
import { FailureRecord } from './types/failure.js';
import { replayArtifact } from './replay/engine.js';
import { generateVerdict } from './replay/verdict.js';
import { banner, section, success, warn, error, info, kvLine, c, icons, statusBadge } from './utils/ui.js';
import { loadConfig, generateDefaultConfig, applyNameTemplate } from './config/loader.js';
import { generateHints } from './replay/hints.js';
import { shareToGist } from './share/gist.js';
import { sanitizeShareError } from './share/gist.js';
import { detectMissingDependencies } from './utils/dependencies.js';
import { determineSourceStrategy } from './capture/source-strategy.js';
import { captureEnvSnapshot, compareEnvSnapshots, EnvSnapshot } from './capture/env-snapshot.js';
import { detectProjectLanguages } from './capture/language-support.js';
import {
  secureJsonParse,
  validateArtifactManifest,
  validateFailureRecord,
  validateRunConfig,
} from './utils/artifact-validation.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version;

function enforceNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (Number.isNaN(major) || major < 18) {
    console.error(`BugProof requires Node.js >= 18.0.0. Current runtime: ${process.version}`);
    process.exit(1);
  }
}

enforceNodeVersion();

const program = new Command();

program
  .name('bugproof')
  .description('Executable bug artifacts \u2014 portable, reproducible bug reports')
  .version(VERSION);

program.showHelpAfterError();
program.showSuggestionAfterError();
program.addHelpCommand('help [command]', 'Display help for command');

// ─── CAPTURE ─────────────────────────────────────────────────────────────────

program
  .command('capture', { isDefault: false })
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

// ─── REPLAY ──────────────────────────────────────────────────────────────────

program
  .command('replay')
  .description('Replay a .bug artifact to reproduce a failure')
  .argument('<artifact>', 'Path to the .bug artifact directory')
  .option('--version-match <mode>', 'Git checkout mode: strict, current, branch', 'current')
  .option('--sandbox <level>', 'Sandbox level: workspace, isolated, full', 'workspace')
  .option('--container', 'Use BugBox container isolation (lightweight, no Docker needed)')
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

    const stat = fs.statSync(artifact);
    let targetPath = artifact;
    let tempDir: string | undefined;

    try {
      if (stat.isFile()) {
        if (!jsonMode) info('Extracting compressed artifact...');
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-extract-'));
        targetPath = tempDir;
        try {
          await extractZip(artifact, tempDir);
        } catch {
          if (jsonMode) {
            console.log(JSON.stringify({ reproduced: false, error: 'Corrupted artifact: Invalid or damaged .bug file' }));
          } else {
            error('Corrupted artifact: Invalid or damaged .bug file');
            info('The file may not be a valid .bug artifact or may be truncated.');
          }
          process.exit(1);
        }
      }

      let manifest: ArtifactManifest;
      let runConfig: RunConfig;
      let expectedFailure: FailureRecord;

      try {
        const manifestRaw = fs.readFileSync(path.join(targetPath, 'manifest.json'), 'utf-8');
        const runRaw = fs.readFileSync(path.join(targetPath, 'run.json'), 'utf-8');
        const failureRaw = fs.readFileSync(path.join(targetPath, 'failure.json'), 'utf-8');

        manifest = validateArtifactManifest(secureJsonParse(manifestRaw, 'manifest.json'));
        runConfig = validateRunConfig(secureJsonParse(runRaw, 'run.json'));
        expectedFailure = validateFailureRecord(secureJsonParse(failureRaw, 'failure.json'));
      } catch (parseErr) {
        if (jsonMode) {
          console.log(JSON.stringify({ reproduced: false, error: `Corrupted artifact: ${parseErr}` }));
        } else {
          error(`Corrupted artifact — invalid metadata in ${artifact}`);
          info(`Detail: ${parseErr}`);
        }
        process.exit(1);
      }

    if (!jsonMode) {
      kvLine('Artifact', manifest.name);
      kvLine('Captured', manifest.captured_at);
      kvLine('Command', manifest.command.join(' '));
      kvLine('Platform', `${manifest.captured_on.os}/${manifest.captured_on.arch}`);
      if (manifest.captured_on.git_commit) {
        kvLine('Git', `${manifest.captured_on.git_branch || '?'} @ ${manifest.captured_on.git_commit.slice(0, 8)}`);
      }
      console.log();

      // Check environment snapshot for mismatches
      const envSnapshotPath = path.join(targetPath, 'env-snapshot.json');
      if (fs.existsSync(envSnapshotPath)) {
        try {
          const capturedSnapshot: EnvSnapshot = JSON.parse(fs.readFileSync(envSnapshotPath, 'utf-8'));
          const currentSnapshot = captureEnvSnapshot();
          const mismatches = compareEnvSnapshots(capturedSnapshot, currentSnapshot);

          const warnings = mismatches.filter(m => m.severity === 'warning' || m.severity === 'error');
          if (warnings.length > 0) {
            section('Environment Mismatches');
            for (const m of warnings) {
              const icon = m.severity === 'error' ? c.red(icons.cross) : c.yellow(icons.dot);
              console.log(`    ${icon} ${m.message}`);
            }
            console.log();
          }
        } catch {
          // Ignore optional snapshot parsing errors and continue replay.
        }
      }
    }

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
        artifactPath: targetPath,
        versionMatch: options.versionMatch,
      sandboxLevel: options.sandbox,
      envOverrides,
      gitCommit: manifest.captured_on.git_commit,
      gitBranch: manifest.captured_on.git_branch,
      capturedPlatform: manifest.captured_on.os,
    });

    const verdict = generateVerdict(replayResult);

    if (jsonMode) {
      console.log(formatReplayJson({
        verdict,
        expectedExitCode: expectedFailure.exit_code,
        actualExitCode: replayResult.actualFailure.exit_code,
        artifactName: manifest.name,
        bugBox: replayResult.bugBox,
      }));
    } else {
      if ((options.sandbox === 'isolated' || options.sandbox === 'full') && replayResult.bugBox?.platform === 'win32') {
        warn('Windows sandbox isolation is best-effort. Use a VM for untrusted artifacts.');
      }

      // Show cross-platform warnings/translations before verdict
      if (replayResult.crossPlatform) {
        section('Cross-Platform Translation');
        for (const w of replayResult.crossPlatform.warnings) {
          console.log(`    ${c.yellow(icons.dot)} ${w}`);
        }
        for (const t of replayResult.crossPlatform.translations) {
          console.log(`    ${c.cyan(icons.arrow)} ${t}`);
        }
        if (replayResult.crossPlatform.blockers.length > 0) {
          for (const b of replayResult.crossPlatform.blockers) {
            console.log(`    ${c.red(icons.cross)} ${b}`);
          }
        }
        console.log();
      }

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
      
      if (replayResult.bugBox && replayResult.bugBox.level !== 'workspace') {
        section('Bug-Box Sandbox');
        kvLine('Level', replayResult.bugBox.level);
        kvLine('Applied', replayResult.bugBox.appliedLayers.join(', ') || 'none');
        if (replayResult.bugBox.skippedLayers.length > 0) {
          kvLine('Skipped', c.yellow(replayResult.bugBox.skippedLayers[0] + (replayResult.bugBox.skippedLayers.length > 1 ? '...' : '')));
        }
      }

      // Show smart hints when replay doesn't confirm reproduction
      if (verdict.status !== 'confirmed') {
        const hints = generateHints(expectedFailure, replayResult.actualFailure, replayResult.actualStderr);
        if (hints.length > 0) {
          section('Hints');
          for (const hint of hints) {
            const icon = hint.confidence === 'high' ? icons.arrow : icons.dot;
            console.log(`    ${c.yellow(icon)} ${c.bold(hint.title)}`);
            console.log(`      ${hint.suggestion}`);
          }
        }

        // Show build commands from language context if available
        const langCtxPath = path.join(targetPath, 'language-context.json');
        if (fs.existsSync(langCtxPath)) {
          try {
            const langCtx = JSON.parse(fs.readFileSync(langCtxPath, 'utf-8'));
            if (langCtx.buildCommands && langCtx.buildCommands.length > 0) {
              section('Build Steps Required');
              for (const cmd of langCtx.buildCommands) {
                console.log(`    ${c.cyan(icons.arrow)} ${cmd}`);
              }
            }
            if (langCtx.warnings && langCtx.warnings.length > 0) {
              section('Language Warnings');
              for (const w of langCtx.warnings) {
                console.log(`    ${c.yellow(icons.dot)} ${w}`);
              }
            }
          } catch { /* ignore parse errors */ }
        }
      }
      
      console.log();
    }

    const exitCode = verdict.status === 'confirmed' ? 0 : 1;
    if (!tempDir) {
      process.exit(exitCode);
    } else {
      process.exitCode = exitCode;
    }
  } finally {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

// ─── INSPECT ─────────────────────────────────────────────────────────────────

program
  .command('inspect')
  .description('Inspect the contents of a .bug artifact')
  .argument('<artifact>', 'Path to the .bug artifact directory')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action(async (artifact: string, options) => {
    const jsonMode = options.json === true;

    if (!fs.existsSync(artifact)) {
      if (jsonMode) {
        console.log(JSON.stringify({ error: `Artifact not found: ${artifact}` }));
      } else {
        error(`Artifact not found at ${artifact}`);
      }
      process.exit(1);
    }

    const stat = fs.statSync(artifact);
    let targetPath = artifact;
    let tempDir: string | undefined;

    try {
      if (stat.isFile()) {
        if (!jsonMode) info('Extracting compressed artifact...');
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-extract-'));
        targetPath = tempDir;
        try {
          await extractZip(artifact, tempDir);
        } catch {
          if (jsonMode) {
            console.log(JSON.stringify({ error: 'Corrupted artifact: Invalid or damaged .bug file' }));
          } else {
            error('Corrupted artifact: Invalid or damaged .bug file');
            info('The file may not be a valid .bug artifact or may be truncated.');
          }
          process.exit(1);
        }
      }

      const manifestRaw = fs.readFileSync(path.join(targetPath, 'manifest.json'), 'utf-8');
      const failureRaw = fs.readFileSync(path.join(targetPath, 'failure.json'), 'utf-8');

      const manifest: ArtifactManifest = validateArtifactManifest(secureJsonParse(manifestRaw, 'manifest.json'));
      const failure = validateFailureRecord(secureJsonParse(failureRaw, 'failure.json'));

      // Read file entries
      const filesJsonPath = path.join(targetPath, 'files.json');
      const files = fs.existsSync(filesJsonPath) ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf-8')) : [];

    if (jsonMode) {
      console.log(formatInspectJson({ manifest, failure, files }));
      return;
    }

    banner('BugProof Inspect');

    // Manifest
    section('Manifest');
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
    section('Failure');
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
      section('Stderr (last 5 lines)');
      for (const line of failure.stderr_snippet.split('\n')) {
        console.log(`  ${c.red(line)}`);
      }
      console.log(c.dim('  ' + '\u2500'.repeat(38)));
    }

    console.log();

    // Files summary
    if (files.length > 0) {
      section(`Files (${files.length} captured)`);
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
      section('Secrets (redacted)');
      for (const s of manifest.secrets_skipped) {
        console.log(`    ${c.yellow(icons.dot)} ${s}`);
      }
    }

    console.log();
    } finally {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

// ─── DIFF ────────────────────────────────────────────────────────────────────

program
  .command('diff')
  .description('Compare two .bug artifacts side by side')
  .argument('<left>', 'Path to the first .bug artifact')
  .argument('<right>', 'Path to the second .bug artifact')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action(async (leftPath: string, rightPath: string, options) => {
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

    let leftTarget = leftPath;
    let rightTarget = rightPath;
    const tempDirs: string[] = [];

    try {
      if (!jsonMode) info('Extracting artifacts...');

      if (fs.statSync(leftPath).isFile()) {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-diff-l-'));
        tempDirs.push(d);
        leftTarget = d;
        await extractZip(leftPath, d);
      }

      if (fs.statSync(rightPath).isFile()) {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-diff-r-'));
        tempDirs.push(d);
        rightTarget = d;
        await extractZip(rightPath, d);
      }

    const loadSnapshot = (artifactDir: string): ArtifactSnapshot => {
      const manifest = validateArtifactManifest(
        secureJsonParse(fs.readFileSync(path.join(artifactDir, 'manifest.json'), 'utf-8'), 'manifest.json'),
      );
      const failure = validateFailureRecord(
        secureJsonParse(fs.readFileSync(path.join(artifactDir, 'failure.json'), 'utf-8'), 'failure.json'),
      );
      const filesJsonPath = path.join(artifactDir, 'files.json');
      const files = fs.existsSync(filesJsonPath) ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf-8')) : [];
      return { manifest, failure, files };
    };

    const left = loadSnapshot(leftTarget);
    const right = loadSnapshot(rightTarget);
    const result = diffArtifacts(left, right);

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    banner('BugProof Diff');

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
      section('Property Changes');
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
        section('File Changes');
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
    } finally {
      for (const d of tempDirs) {
        fs.rmSync(d, { recursive: true, force: true });
      }
    }
  });

// ─── WATCH ──────────────────────────────────────────────────────────────────

program
  .command('watch')
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

    const manifest: ArtifactManifest = {
      version: '1.0',
      bugproof_version: VERSION,
      name: artifactName,
      description: options.description || `Auto-captured failure: ${commandTokens.join(' ')}`,
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

    const artifactDir = path.resolve(outputDir);
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const artifactPath = path.join(artifactDir, `${artifactName}.bug`);

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
        error(`Auto-capture failed: ${err}`);
      }
    }

    process.exit(result.failure.exit_code);
  });

// ─── INIT ───────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a .bugproofrc configuration file in the current directory')
  .option('--force', 'Overwrite existing .bugproofrc')
  .action((options) => {
    const configPath = path.join(process.cwd(), '.bugproofrc');

    if (fs.existsSync(configPath) && !options.force) {
      warn('.bugproofrc already exists. Use --force to overwrite.');
      process.exit(1);
    }

    fs.writeFileSync(configPath, generateDefaultConfig());
    success(`Created ${c.cyan('.bugproofrc')} with default configuration.`);
    console.log();
    info('Customize exclude patterns, timeout, and output directory.');
    info('BugProof will auto-detect this config in the current directory and parents.');
    console.log();
  });

// ─── SHARE ──────────────────────────────────────────────────────────────────

program
  .command('share')
  .description('Share a .bug artifact via GitHub Gist')
  .argument('<artifact>', 'Path to the .bug artifact')
  .option('--public', 'Create a public gist (default: secret/unlisted)')
  .option('--json', 'Output structured JSON')
  .action(async (artifact: string, options) => {
    const jsonMode = options.json === true;

    if (!fs.existsSync(artifact)) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: `Artifact not found: ${artifact}` }));
      } else {
        error(`Artifact not found: ${artifact}`);
      }
      process.exit(1);
    }

    if (!jsonMode) {
      banner(`${icons.arrow} BugProof Share`);
      info('Uploading artifact to GitHub Gist...');
    }

    try {
      const result = await shareToGist(artifact, { public: options.public });

      if (jsonMode) {
        console.log(JSON.stringify({
          success: true,
          url: result.url,
          gist_id: result.gistId,
        }, null, 2));
      } else {
        console.log();
        success('Artifact shared!');
        console.log();
        kvLine('URL', c.cyan(result.url));
        kvLine('Gist ID', result.gistId);
        console.log();
        info('Share this URL with your team. They can inspect the bug details directly on GitHub.');
        console.log();
      }
    } catch (err) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: false, error: sanitizeShareError(String(err)) }));
      } else {
        error(sanitizeShareError(String(err)));
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
