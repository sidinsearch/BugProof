#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
import { helpBanner, ASCII_LOGO, COMPACT_LOGO, c } from './utils/ui.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version;

function enforceNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (Number.isNaN(major) || major < 18) {
    console.error(`BugProof requires Node.js >= 18.0.0. Current runtime: ${process.version}`);
    process.exit(1);
  }
}

enforceNodeVersion();

/** Show a welcome message on first run (creates a marker file so it only shows once) */
function showFirstRunWelcome(): void {
  const markerPath = path.join(os.homedir(), '.bugproof-welcomed');
  if (fs.existsSync(markerPath)) return;

  console.log(ASCII_LOGO);
  console.log(c.bold('  Quick Start'));
  console.log();
  console.log(`  ${c.brand(c.bold('capture'))}  Capture a failing command`);
  console.log(c.dim('           bugproof capture -- node -e "throw new Error(\'demo\')"'));
  console.log();
  console.log(`  ${c.brand(c.bold('replay'))}   Replay a captured bug`);
  console.log(c.dim('           bugproof replay bug-2024-01-15.bug'));
  console.log();
  console.log(`  ${c.brand(c.bold('inspect'))}  Inspect artifact contents`);
  console.log(c.dim('           bugproof inspect bug-2024-01-15.bug'));
  console.log();
  console.log(`  ${c.brand(c.bold('diff'))}     Compare two bug artifacts`);
  console.log(c.dim('           bugproof diff a.bug b.bug'));
  console.log();
  console.log(`  ${c.brand(c.bold('share'))}    Share via GitHub Gist`);
  console.log(c.dim('           bugproof share bug-2024-01-15.bug'));
  console.log();
  console.log(c.dim('  ' + '─'.repeat(60)));
  console.log(c.dim('  Docs: https://github.com/sidinsearch/BugProof'));
  console.log(c.dim('  Run `bugproof --help` for all commands'));
  console.log();

  try { fs.writeFileSync(markerPath, VERSION); } catch { /* ignore */ }
}

// If called with no arguments, show welcome on first run then help
if (process.argv.length <= 2) {
  showFirstRunWelcome();
}

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