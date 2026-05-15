#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import { captureCommand } from './commands/capture.js';
import { replayCommand } from './commands/replay.js';
import { inspectCommand } from './commands/inspect.js';
import { diffCommand } from './commands/diff.js';
import { watchCommand } from './commands/watch.js';
import { initCommand } from './commands/init.js';
import { shareCommand } from './commands/share.js';
import { pullCommand } from './commands/pull.js';
import { pruneCommand } from './commands/prune.js';
import { cleanCommand } from './commands/clean.js';
import { doctorCommand } from './commands/doctor.js';
import { keygenCommand } from './commands/keygen.js';
import { verifyCommand } from './commands/verify.js';
import { mcpCommand } from './commands/mcp.js';
import { helpBanner, ASCII_LOGO, COMPACT_LOGO } from './utils/ui.js';

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
  .version(VERSION)
  .addHelpText('beforeAll', () => {
    helpBanner();
    return '';
  });

// Expose ASCII_LOGO and COMPACT_LOGO for external use (MCP server info, etc.)
void ASCII_LOGO;
void COMPACT_LOGO;

program.showHelpAfterError();
program.showSuggestionAfterError();
program.addHelpCommand('help [command]', 'Display help for command');

program.addCommand(captureCommand);
program.addCommand(replayCommand);
program.addCommand(inspectCommand);
program.addCommand(diffCommand);
program.addCommand(watchCommand);
program.addCommand(initCommand);
program.addCommand(shareCommand);
program.addCommand(pullCommand);
program.addCommand(pruneCommand);
program.addCommand(cleanCommand);
program.addCommand(doctorCommand);
program.addCommand(keygenCommand);
program.addCommand(verifyCommand);
program.addCommand(mcpCommand);

program.parse(process.argv);