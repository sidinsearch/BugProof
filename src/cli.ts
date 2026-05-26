#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
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
import { helpBanner, ASCII_LOGO, COMPACT_LOGO, c, warn } from './utils/ui.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version;

function enforceNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (Number.isNaN(major) || major < 18) {
    console.error(`BugProof requires Node.js >= 18.0.0. Current runtime: ${process.version}`);
    process.exit(1);
  }
}

/**
 * Check for multiple global BugProof installations and warn about version mismatches.
 * This addresses Issue #1 from the v1.4.1 validation report.
 */
function checkGlobalVersionMismatch(): void {
  const platform = os.platform();
  const globalPaths: string[] = [];
  
  // Check npm global prefix
  const prefixResult = spawnSync('npm', ['prefix', '-g'], { encoding: 'utf-8', timeout: 5000 });
  if (prefixResult.status === 0) {
    globalPaths.push(prefixResult.stdout.trim());
  }
  
  // Add platform-specific common global locations
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const commonWinPaths = [
      path.join(appData, 'npm', 'node_modules'),
      path.join(localAppData, 'npm', 'node_modules'),
    ];
    for (const p of commonWinPaths) {
      if (fs.existsSync(p) && !globalPaths.includes(p)) {
        globalPaths.push(p);
      }
    }
  } else {
    const commonUnixPaths = [
      path.join(os.homedir(), '.npm-global', 'lib'),
      path.join(os.homedir(), '.nvm', 'versions', 'node', process.version, 'lib'),
      '/usr/lib/node_modules',
      '/usr/local/lib/node_modules',
      '/opt/homebrew/lib/node_modules',
    ];
    for (const p of commonUnixPaths) {
      if (fs.existsSync(p) && !globalPaths.includes(p)) {
        globalPaths.push(p);
      }
    }
  }
  
  // Find all bugproof installations
  const installations: { path: string; version: string }[] = [];
  for (const globalPath of globalPaths) {
    const pkgPath = path.join(globalPath, 'bugproof', 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        installations.push({ path: globalPath, version: pkg.version });
      } catch {
        // Ignore parse errors
      }
    }
  }
  
  // Warn if multiple versions found
  if (installations.length > 1) {
    const versions = new Set(installations.map(i => i.version));
    if (versions.size > 1) {
      warn(`Multiple BugProof versions detected:`);
      for (const inst of installations) {
        console.error(`    ${inst.version} at ${inst.path}`);
      }
      console.error(`  This may cause unexpected behavior. Consider removing older versions.`);
      console.error();
    }
  }
}

enforceNodeVersion();
checkGlobalVersionMismatch();

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

// Show welcome on first run, then show help on subsequent no-arg invocations
if (process.argv.length <= 2) {
  if (!fs.existsSync(path.join(os.homedir(), '.bugproof-welcomed'))) {
    showFirstRunWelcome();
    process.exit(0);
  }
  // After first run, bare `bugproof` shows help
}

const program = new Command();

program
  .name('bugproof')
  .description('Executable bug artifacts \u2014 portable, reproducible bug reports')
  .version(VERSION)
  .enablePositionalOptions()
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