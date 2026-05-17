import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { extractArtifactIfNeeded, ExtractedArtifact } from '../utils/archive.js';
import { banner, section, info, kvLine, c, icons, table, exitWithError } from '../utils/ui.js';
import { formatInspectJson } from '../utils/json-output.js';
import {
  secureJsonParse,
  validateArtifactManifest,
  validateFailureRecord,
} from '../utils/artifact-validation.js';
import { ArtifactManifest } from '../types/artifact.js';

export const inspectCommand = new Command('inspect')
  .description('Inspect the contents of a .bug artifact')
  .argument('<artifact>', 'Path to the .bug artifact directory')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action(async (artifact: string, options) => {
    const jsonMode = options.json === true;

    let artifactInfo: ExtractedArtifact;
    try {
      artifactInfo = await extractArtifactIfNeeded(artifact);
    } catch {
      exitWithError(`Artifact not found: ${artifact}`, { jsonMode });
      return;
    }

    const { targetDir: targetPath, cleanup } = artifactInfo;

    try {
      if (targetPath !== artifact && !jsonMode) {
        info('Extracting compressed artifact...');
      }

      let manifest: ArtifactManifest;
      let failure: ReturnType<typeof validateFailureRecord>;
      try {
        const manifestRaw = fs.readFileSync(path.join(targetPath, 'manifest.json'), 'utf-8');
        const failureRaw = fs.readFileSync(path.join(targetPath, 'failure.json'), 'utf-8');
        manifest = validateArtifactManifest(secureJsonParse(manifestRaw, 'manifest.json'));
        failure = validateFailureRecord(secureJsonParse(failureRaw, 'failure.json'));
      } catch (parseErr) {
        exitWithError(`Corrupted artifact: ${parseErr}`, { jsonMode });
        return;
      }

      const filesJsonPath = path.join(targetPath, 'files.json');
      const files = fs.existsSync(filesJsonPath) ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf-8')) : [];

      if (jsonMode) {
        console.log(formatInspectJson({ manifest, failure, files }));
        return;
      }

      banner('Inspect');

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

      if (failure.stderr_snippet) {
        section('Stderr (last 5 lines)');
        for (const line of failure.stderr_snippet.split('\n')) {
          console.log(`  ${c.red(line)}`);
        }
        console.log(c.dim('  ' + '\u2500'.repeat(38)));
      }

      console.log();

      if (files.length > 0) {
        section(`Files (${files.length} captured)`);
        const shown = files.slice(0, 15);
        const rows = shown.map((f: { path: string; size: number }) => [
          c.dim((f.size / 1024).toFixed(1) + ' KB'),
          f.path,
        ]);
        table(['Size', 'File'], rows);
        if (files.length > 15) {
          console.log(c.dim(`    ... and ${files.length - 15} more`));
        }
      } else {
        kvLine('Files', `${manifest.files_count} (${(manifest.files_size_bytes / 1024).toFixed(1)} KB)`);
      }

      if (manifest.secrets_detected) {
        section('Secrets (redacted)');
        for (const s of manifest.secrets_skipped) {
          console.log(`    ${c.yellow(icons.dot)} ${s}`);
        }
      }

      console.log();
    } finally {
      cleanup();
    }
  });