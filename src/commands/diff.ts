import { Command } from 'commander';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { extractZip } from '../utils/archive.js';
import { diffArtifacts, ArtifactSnapshot } from '../diff/engine.js';
import { banner, section, success, error, info, kvLine, c } from '../utils/ui.js';
import {
  secureJsonParse,
  validateArtifactManifest,
  validateFailureRecord,
} from '../utils/artifact-validation.js';

export const diffCommand = new Command('diff')
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