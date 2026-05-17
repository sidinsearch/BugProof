import { Command } from 'commander';
import { pruneTempDirectories } from '../utils/cleanup.js';
import { banner, success, info, kvLine } from '../utils/ui.js';

export const pruneCommand = new Command('prune')
  .description('Clean up temporary sandbox and artifact directories')
  .action(() => {
    banner('Prune');
    info('Scanning temporary directories...');
    const result = pruneTempDirectories();
    if (result.prunedCount === 0) {
      success('Nothing to clean up. Temp directory is pristine.');
    } else {
      success(`Pruned ${result.prunedCount} orphan directories.`);
      kvLine('Reclaimed', `${(result.prunedBytes / 1024 / 1024).toFixed(2)} MB`);
    }
    console.log();
  });