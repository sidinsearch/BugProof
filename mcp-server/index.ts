/**
 * BugProof MCP Server
 *
 * Model Context Protocol server that exposes bugproof's capture, replay,
 * and inspect capabilities as MCP tools. Runs over stdio.
 *
 * Usage:
 *   npx tsx mcp-server/index.ts
 *
 * MCP Tools:
 *   - capture:   Run a command and capture output as a .bug artifact
 *   - replay:    Replay a .bug file and return the verdict
 *   - inspect:   Show metadata for a .bug artifact
 */

import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

// ── JSON-RPC helpers ──

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function send(msg: JSONRPCResponse): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendEvent(method: string, params: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

// ── MCP protocol constants ──

const PROTOCOL_VERSION = '2025-03-26';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'capture',
    description: 'Run a command and capture its output as a .bug artifact',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run and capture' },
        name: { type: 'string', description: 'Artifact name (optional)' },
        timeout: { type: 'string', description: 'Timeout in ms (default: 300000)' },
        skipSecrets: { type: 'boolean', description: 'Skip secret scanning (default: false)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'replay',
    description: 'Replay a .bug file and return the reproduction verdict',
    inputSchema: {
      type: 'object',
      properties: {
        artifact: { type: 'string', description: 'Path to the .bug file to replay' },
        workingDir: { type: 'string', description: 'Working directory for replay (optional)' },
      },
      required: ['artifact'],
    },
  },
  {
    name: 'inspect',
    description: 'Show metadata for a .bug artifact without replaying',
    inputSchema: {
      type: 'object',
      properties: {
        artifact: { type: 'string', description: 'Path to the .bug file to inspect' },
      },
      required: ['artifact'],
    },
  },
  {
    name: 'diff',
    description: 'Compare two .bug artifacts',
    inputSchema: {
      type: 'object',
      properties: {
        left: { type: 'string', description: 'Path to the first .bug file' },
        right: { type: 'string', description: 'Path to the second .bug file' },
      },
      required: ['left', 'right'],
    },
  },
];

// ── MCP handler ──

function handleRequest(req: JSONRPCRequest): void {
  const { id, method, params } = req;

  switch (method) {
    // Lifecycle
    case 'initialize': {
      send({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'bugproof-mcp', version: '1.0.0' },
        },
      });
      sendEvent('notifications/initialized', {});
      break;
    }

    case 'tools/list': {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      break;
    }

    case 'tools/call': {
      const p = params as { name: string; arguments?: Record<string, unknown> } | undefined;
      const toolName = p?.name;
      const args = p?.arguments ?? {};

      switch (toolName) {
        case 'capture':
          handleCapture(id, args as { command: string; name?: string; timeout?: string; skipSecrets?: boolean });
          break;
        case 'replay':
          handleReplay(id, args as { artifact: string; workingDir?: string });
          break;
        case 'inspect':
          handleInspect(id, args as { artifact: string });
          break;
        case 'diff':
          handleDiff(id, args as { left: string; right: string });
          break;
        default:
          send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${toolName}` } });
      }
      break;
    }

    case 'notifications/initialized':
      // Ignore client init notification
      send({ jsonrpc: '2.0', id, result: null });
      break;

    default:
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

function runBugproof(args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('npx', ['-y', 'bugproof', ...args], {
    encoding: 'utf-8',
    timeout: 300000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    status: result.status ?? 1,
  };
}

function handleCapture(id: number | string, args: { command: string; name?: string; timeout?: string; skipSecrets?: boolean }): void {
  const cmdArgs = ['capture', '--json'];
  if (args.name) cmdArgs.push('-n', args.name);
  if (args.timeout) cmdArgs.push('--timeout', args.timeout);
  if (args.skipSecrets) cmdArgs.push('--skip-secrets');
  cmdArgs.push('--', ...args.command.split(/\s+/));

  const result = runBugproof(cmdArgs);

  if (result.status !== 0) {
    send({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: `Capture failed: ${result.stderr || result.stdout}` },
    });
    return;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    send({ jsonrpc: '2.0', id, result: parsed });
  } catch {
    send({
      jsonrpc: '2.0', id,
      result: {
        raw_output: result.stdout,
        artifact_path: `${args.name || 'bug'}.bug`,
      },
    });
  }
}

function handleReplay(id: number | string, args: { artifact: string; workingDir?: string }): void {
  const artifactPath = path.resolve(args.artifact);
  if (!fs.existsSync(artifactPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Artifact not found: ${artifactPath}` } });
    return;
  }

  const cmdArgs = ['replay', artifactPath, '--json'];
  if (args.workingDir) cmdArgs.push('--workdir', args.workingDir);

  const result = runBugproof(cmdArgs);

  if (result.status !== 0) {
    send({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: `Replay failed: ${result.stderr || result.stdout}` },
    });
    return;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    send({ jsonrpc: '2.0', id, result: parsed });
  } catch {
    send({ jsonrpc: '2.0', id, result: { raw_output: result.stdout } });
  }
}

function handleInspect(id: number | string, args: { artifact: string }): void {
  const artifactPath = path.resolve(args.artifact);
  if (!fs.existsSync(artifactPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Artifact not found: ${artifactPath}` } });
    return;
  }

  const result = runBugproof(['inspect', '--json', artifactPath]);

  if (result.status !== 0) {
    send({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: `Inspect failed: ${result.stderr || result.stdout}` },
    });
    return;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    send({ jsonrpc: '2.0', id, result: parsed });
  } catch {
    send({ jsonrpc: '2.0', id, result: { raw_output: result.stdout } });
  }
}

function handleDiff(id: number | string, args: { left: string; right: string }): void {
  const leftPath = path.resolve(args.left);
  const rightPath = path.resolve(args.right);

  if (!fs.existsSync(leftPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Left artifact not found: ${leftPath}` } });
    return;
  }
  if (!fs.existsSync(rightPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Right artifact not found: ${rightPath}` } });
    return;
  }

  const result = runBugproof(['diff', leftPath, rightPath, '--json']);

  if (result.status !== 0) {
    send({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: `Diff failed: ${result.stderr || result.stdout}` },
    });
    return;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    send({ jsonrpc: '2.0', id, result: parsed });
  } catch {
    send({ jsonrpc: '2.0', id, result: { raw_output: result.stdout } });
  }
}

// ── Main loop ──

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  try {
    const req = JSON.parse(line) as JSONRPCRequest;
    handleRequest(req);
  } catch (err) {
    send({
      jsonrpc: '2.0',
      id: -1,
      error: { code: -32700, message: `Parse error: ${(err as Error).message}` },
    });
  }
});

process.stderr.write('bugproof-mcp: server started (stdio)\n');
