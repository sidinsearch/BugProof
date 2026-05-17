import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { extractArtifactIfNeeded, ExtractedArtifact } from '../utils/archive.js';
import { diffArtifacts, ArtifactSnapshot } from '../diff/engine.js';
import { banner, section, success, info, kvLine, c, table, exitWithError } from '../utils/ui.js';
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

    let leftInfo: ExtractedArtifact;
    let rightInfo: ExtractedArtifact;
    try {
      leftInfo = await extractArtifactIfNeeded(leftPath);
      rightInfo = await extractArtifactIfNeeded(rightPath);
    } catch (err) {
      exitWithError(String(err), { jsonMode });
      return;
    }

    const leftTarget = leftInfo.targetDir;
    const rightTarget = rightInfo.targetDir;

    if (!jsonMode && (leftTarget !== leftPath || rightTarget !== rightPath)) {
      info('Extracting artifacts...');
    }

    try {

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

    banner('Diff');

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
        const rows: string[][] = [];
        for (const f of fc.added) {
          rows.push([c.green('+ ' + f), c.dim('added')]);
        }
        for (const f of fc.removed) {
          rows.push([c.red('- ' + f), c.dim('removed')]);
        }
        for (const f of fc.modified) {
          rows.push([c.yellow('~ ' + f), c.dim('modified')]);
        }
        table(['File', 'Change'], rows);
        console.log();
      }
    }

    info(`${result.changes.length} property changes, ${(result.fileChanges?.added.length || 0) + (result.fileChanges?.removed.length || 0) + (result.fileChanges?.modified.length || 0)} file changes.`);
    console.log();
    } finally {
      leftInfo.cleanup();
      rightInfo.cleanup();
    }
  });