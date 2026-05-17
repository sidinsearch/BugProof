import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { banner, success, info, kvLine, c, icons, warn } from '../utils/ui.js';

export const cleanCommand = new Command('clean')
  .description('Remove .bug artifacts from the current directory')
  .option('--all', 'Include subdirectories (default: current directory only)')
  .option('--dry-run', 'Show what would be deleted without actually deleting')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action((options) => {
    const jsonMode = options.json === true;
    const searchDir = process.cwd();
    const maxDepth = options.all ? 10 : 1;

    if (!jsonMode) banner('Clean');

    const artifacts: string[] = [];
    let totalSize = 0;

    function findArtifacts(dir: string, depth: number): void {
      if (depth > maxDepth) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.name.endsWith('.bug')) {
            try {
              const stat = fs.statSync(fullPath);
              artifacts.push(fullPath);
              totalSize += stat.size;
            } catch { /* skip */ }
          } else if (entry.isDirectory() && options.all) {
            findArtifacts(fullPath, depth + 1);
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    findArtifacts(searchDir, 0);

    if (artifacts.length === 0) {
      if (jsonMode) {
        console.log(JSON.stringify({ success: true, cleaned: 0, reclaimed_bytes: 0 }));
      } else {
        success('No .bug artifacts found. Workspace is clean.');
        console.log();
      }
      return;
    }

    if (options.dryRun) {
      if (jsonMode) {
        console.log(JSON.stringify({
          success: true,
          dry_run: true,
          artifacts: artifacts,
          count: artifacts.length,
          total_size_bytes: totalSize,
        }, null, 2));
      } else {
        info(`Found ${artifacts.length} artifact(s) (${(totalSize / 1024).toFixed(1)} KB):`);
        console.log();
        for (const a of artifacts) {
          console.log(`    ${c.yellow(icons.dot)} ${a}`);
        }
        console.log();
        warn('Dry run — nothing deleted. Remove --dry-run to actually clean.');
        console.log();
      }
      return;
    }

    // Actually delete
    let deleted = 0;
    let reclaimed = 0;
    for (const artifact of artifacts) {
      try {
        const stat = fs.statSync(artifact);
        if (stat.isFile()) {
          fs.rmSync(artifact, { force: true });
          deleted++;
          reclaimed += stat.size;
        } else if (stat.isDirectory()) {
          fs.rmSync(artifact, { recursive: true, force: true });
          deleted++;
          reclaimed += stat.size;
        }
      } catch { /* skip */ }
    }

    if (jsonMode) {
      console.log(JSON.stringify({
        success: true,
        cleaned: deleted,
        reclaimed_bytes: reclaimed,
      }, null, 2));
    } else {
      if (deleted > 0) {
        success(`Removed ${deleted} artifact(s).`);
        kvLine('Reclaimed', `${(reclaimed / 1024).toFixed(1)} KB`);
      } else {
        warn('Could not remove any artifacts (permission denied or already deleted).');
      }
      console.log();
    }
  });
