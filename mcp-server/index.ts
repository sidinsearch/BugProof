#!/usr/bin/env node

/**
 * BugProof MCP Server — standalone entry point.
 *
 * This is a thin wrapper that delegates to `bugproof mcp`.
 * The actual MCP server logic lives in src/commands/mcp.ts.
 *
 * Usage (MCP config in Claude Code / Cursor etc.):
 *   {
 *     "mcpServers": {
 *       "bugproof": {
 *         "command": "npx",
 *         "args": ["-y", "bugproof", "mcp"]
 *       }
 *     }
 *   }
 *
 * Or install globally and run directly:
 *   npx -y @bugproof/mcp-server
 *   bugproof mcp
 *
 * The MCP server communicates over stdio and exposes tools:
 *   capture   — Run a command, capture output as .bug artifact
 *   replay    — Replay a .bug file, return reproduction verdict
 *   inspect   — Show metadata for a .bug file
 *   diff      — Compare two .bug artifacts
 *   doctor    — Check sandbox capabilities
 */

import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

let cliPath: string;
try {
  cliPath = _require.resolve('bugproof/dist/cli.js');
} catch {
  const result = spawnSync('npx', ['-y', 'bugproof', 'mcp'], {
    stdio: 'inherit',
    env: { ...process.env },
  });
  process.exit(result.status ?? 1);
  throw new Error('unreachable');
}

const result = spawnSync(process.execPath, [cliPath, 'mcp'], {
  stdio: 'inherit',
  env: { ...process.env },
});

process.exit(result.status ?? 1);
