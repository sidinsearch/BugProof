import { Command } from 'commander';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { extractZip } from '../utils/archive.js';
import { banner, section, error, info, kvLine, c, icons } from '../utils/ui.js';
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