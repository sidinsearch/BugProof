import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { generateDefaultConfig } from '../config/loader.js';
import { success, warn, info, c } from '../utils/ui.js';

export const initCommand = new Command('init')
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