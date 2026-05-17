import { Command } from 'commander';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { extractZip } from '../utils/archive.js';
import { replayArtifact } from '../replay/engine.js';
import { generateVerdict } from '../replay/verdict.js';
import { banner, section, success, warn, error, info, kvLine, c, icons, Spinner, summaryBox, renderLogo } from '../utils/ui.js';
import { generateHints } from '../replay/hints.js';
import { selfHealReplay } from '../replay/self-heal.js';
import { captureEnvSnapshot, compareEnvSnapshots, EnvSnapshot } from '../capture/env-snapshot.js';
import { formatReplayJson } from '../utils/json-output.js';
import {
  secureJsonParse,
  validateArtifactManifest,
  validateFailureRecord,
  validateRunConfig,
} from '../utils/artifact-validation.js';
import {
  SIGNATURE_FILE,
  buildSignedPayload,
  publicKeyFingerprint,
  verifySignature,
  SignatureRecord,
} from '../utils/signing.js';
import { RunConfig, ArtifactManifest } from '../types/artifact.js';
import { FailureRecord } from '../types/failure.js';

export const replayCommand = new Command('replay')
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
  .option('--replay-count <n>', 'Number of times to retry replay for flaky bugs', '1')
  .option('--self-heal', 'Auto-install missing npm/pip dependencies and retry on failure')
  .option('--verify-signature', 'Require a valid Ed25519 signature; exit non-zero if missing or invalid')
  .option('--source-dir <dir>', 'Override source directory for git operations (use current dir\'s repo instead of captured path)')
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

    if (!jsonMode) {
      await renderLogo();
      banner('Replay');
    }

    const stat = fs.statSync(artifact);
    let targetPath = artifact;
    let tempDir: string | undefined;

    let extractSpinner: Spinner | undefined;
    try {
      if (stat.isFile()) {
        if (!jsonMode) {
          extractSpinner = new Spinner('Extracting compressed artifact');
          extractSpinner.start();
        }
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-extract-'));
        targetPath = tempDir;
        try {
          await extractZip(artifact, tempDir);
          extractSpinner?.stop();
        } catch {
          extractSpinner?.stop();
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

      // 2a. Signature verification (Phase 2.2). Always checked when present;
      // --verify-signature also requires presence.
      const sigPath = path.join(targetPath, SIGNATURE_FILE);
      let signatureStatus: 'absent' | 'valid' | 'invalid' = 'absent';
      let signatureRecord: SignatureRecord | undefined;
      let signatureReason: string | undefined;
      if (fs.existsSync(sigPath)) {
        try {
          signatureRecord = JSON.parse(fs.readFileSync(sigPath, 'utf-8'));
          const filesJsonPath = path.join(targetPath, 'files.json');
          const fileEntries = fs.existsSync(filesJsonPath)
            ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf-8'))
            : [];
          const { payload } = buildSignedPayload({
            manifest,
            failure: expectedFailure,
            fileEntries,
          });
          const verifyRes = verifySignature(signatureRecord!, payload);
          signatureStatus = verifyRes.valid ? 'valid' : 'invalid';
          signatureReason = verifyRes.reason;
        } catch (verifyErr) {
          signatureStatus = 'invalid';
          signatureReason = `Failed to parse signature: ${(verifyErr as Error).message}`;
        }
      }

      if (options.verifySignature && signatureStatus !== 'valid') {
        const msg = signatureStatus === 'absent'
          ? 'No signature.json found in artifact, but --verify-signature was required'
          : `Signature invalid: ${signatureReason || 'unknown reason'}`;
        if (jsonMode) {
          console.log(JSON.stringify({ reproduced: false, signature: signatureStatus, error: msg }));
        } else {
          error(msg);
        }
        process.exit(2);
      }

      if (!jsonMode) {
        kvLine('Artifact', manifest.name);
        kvLine('Captured', manifest.captured_at);
        kvLine('Command', manifest.command.join(' '));
        kvLine('Platform', `${manifest.captured_on.os}/${manifest.captured_on.arch}`);
        if (manifest.captured_on.git_commit) {
          kvLine('Git', `${manifest.captured_on.git_branch || '?'} @ ${manifest.captured_on.git_commit.slice(0, 8)}`);
        }
        if (signatureStatus !== 'absent' && signatureRecord) {
          const fp = publicKeyFingerprint(signatureRecord.public_key);
          if (signatureStatus === 'valid') {
            kvLine('Signature', `${c.green(icons.check)} valid (key ${c.dim(fp)}${signatureRecord.signer ? `, ${signatureRecord.signer}` : ''})`);
          } else {
            kvLine('Signature', `${c.red(icons.cross)} ${signatureReason || 'invalid'}`);
          }
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

      const replayCount = parseInt(options.replayCount, 10) || 1;
      let replayResult: Awaited<ReturnType<typeof replayArtifact>> | undefined;
      let verdict: ReturnType<typeof generateVerdict> | undefined;
      let selfHealAttempts: Awaited<ReturnType<typeof selfHealReplay>>['attempts'] = [];

      const replayOpts = {
        artifactPath: targetPath,
        versionMatch: options.versionMatch,
        sandboxLevel: options.sandbox,
        envOverrides,
        gitCommit: manifest.captured_on.git_commit,
        gitBranch: manifest.captured_on.git_branch,
        capturedPlatform: manifest.captured_on.os,
        capturedArch: manifest.captured_on.arch,
        sourceDir: options.sourceDir,
      };

      if (options.selfHeal) {
        if (!jsonMode) {
          info('Self-heal enabled: will attempt to install missing dependencies on failure.');
        }
        const healResult = await selfHealReplay(runConfig, expectedFailure, replayOpts);
        replayResult = healResult.finalResult;
        verdict = generateVerdict(healResult.finalResult);
        selfHealAttempts = healResult.attempts;
      } else {
        for (let i = 0; i < replayCount; i++) {
          if (replayCount > 1 && !jsonMode) {
            info(`Replay attempt ${i + 1}/${replayCount}...`);
          }

          replayResult = await replayArtifact(runConfig, expectedFailure, replayOpts);
          verdict = generateVerdict(replayResult);

          if (verdict.status === 'confirmed') {
            if (replayCount > 1 && !jsonMode) {
              success(`Reproduced successfully on attempt ${i + 1}!`);
            }
            break;
          }
        }
      }

      if (!replayResult || !verdict) {
        throw new Error('Replay engine failed to execute');
      }

      // Surface self-heal trail
      if (selfHealAttempts.length > 0 && !jsonMode) {
        section('Self-Heal Attempts');
        for (const attempt of selfHealAttempts) {
          console.log(`    ${c.cyan(icons.arrow)} Round ${attempt.round}: installed [${attempt.installed.join(', ') || 'none'}]${attempt.failedToInstall.length ? ` failed [${attempt.failedToInstall.join(', ')}]` : ''} -> ${attempt.verdictStatus}`);
        }
        console.log();
      }

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
          warn('Windows sandbox isolation is best-effort only:');
          console.log(`    ${c.yellow(icons.dot)} No process namespace — replayed process can see host processes`);
          console.log(`    ${c.yellow(icons.dot)} No memory limits — Job Objects do not enforce RAM caps on Windows`);
          console.log(`    ${c.yellow(icons.dot)} Network firewall is process-specific, not system-wide`);
          console.log(`    ${c.yellow(icons.dot)} For untrusted artifacts, use a VM or container.`);
          console.log();
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

        // Show replay output (stdout/stderr) before verdict box
        if (replayResult.actualStdout || replayResult.actualStderr) {
          section('Replay Output');
          if (replayResult.actualStdout) {
            console.log(c.dim('  [stdout]'));
            const lines = replayResult.actualStdout.split('\n').slice(0, 30);
            for (const line of lines) {
              console.log(`    ${line}`);
            }
            if (replayResult.actualStdout.split('\n').length > 30) {
              console.log(c.dim(`    ... (${replayResult.actualStdout.split('\n').length - 30} more lines)`));
            }
            console.log();
          }
          if (replayResult.actualStderr) {
            console.log(c.dim('  [stderr]'));
            const lines = replayResult.actualStderr.split('\n').slice(0, 30);
            for (const line of lines) {
              console.log(`    ${c.red(line)}`);
            }
            if (replayResult.actualStderr.split('\n').length > 30) {
              console.log(c.dim(`    ... (${replayResult.actualStderr.split('\n').length - 30} more lines)`));
            }
            console.log();
          }
        }

        const exitMatch = expectedFailure.exit_code === replayResult.actualFailure.exit_code;
        const exitLabel = exitMatch
          ? c.green(`exit ${replayResult.actualFailure.exit_code} (match)`)
          : c.red(`expected ${expectedFailure.exit_code}, got ${replayResult.actualFailure.exit_code}`);

        summaryBox('Replay Verdict', [
          { label: 'Verdict', value: verdict.message, highlight: verdict.status === 'confirmed' },
          { label: 'Exit code', value: exitLabel },
          ...(replayResult.sourceType ? [{ label: 'Source', value: replayResult.sourceType }] : []),
          ...(replayResult.fallbackReason ? [{ label: 'Note', value: c.yellow(replayResult.fallbackReason) }] : []),
          ...(replayResult.bugBox && replayResult.bugBox.level !== 'workspace' ? [
            { label: 'Sandbox level', value: replayResult.bugBox.level },
            { label: 'Applied', value: replayResult.bugBox.appliedLayers.join(', ') || 'none' },
            ...(replayResult.bugBox.skippedLayers.length > 0 ? [{ label: 'Skipped', value: c.yellow(replayResult.bugBox.skippedLayers[0] + (replayResult.bugBox.skippedLayers.length > 1 ? '...' : '')) }] : []),
          ] : []),
        ]);

        // Check if this artifact was captured in stacktrace-only mode (no source files)
        const sourceStrategyPath = path.join(targetPath, 'source-strategy.json');
        let isStacktraceOnly = false;
        if (manifest.files_count === 0 && manifest.files_size_bytes === 0 && fs.existsSync(sourceStrategyPath)) {
          try {
            JSON.parse(fs.readFileSync(sourceStrategyPath, 'utf-8'));
            isStacktraceOnly = true;
          } catch { /* ignore parse errors */ }
        }

        // Show smart hints when replay doesn't confirm reproduction
        if (verdict.status !== 'confirmed') {
          if (isStacktraceOnly) {
            section('Source Files Not Available');
            console.log(`    ${c.yellow(icons.dot)} ${c.bold('Artifact captured in stacktrace-only mode')}`);
            console.log(`      The source files exceeded the hardware limit (100MB or 10,000 files)`);
            console.log(`      at capture time, so they were excluded from the artifact.`);
            console.log(`      Replay fails because the command's source files are missing.`);
            console.log(`      To reproduce: checkout the original repo and run the command manually.`);
          } else {
            const hints = generateHints(expectedFailure, replayResult.actualFailure, replayResult.actualStderr);
            if (hints.length > 0) {
              section('Hints');
              for (const hint of hints) {
                const icon = hint.confidence === 'high' ? icons.arrow : icons.dot;
                console.log(`    ${c.yellow(icon)} ${c.bold(hint.title)}`);
                console.log(`      ${hint.suggestion}`);
              }
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