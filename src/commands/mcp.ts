import { Command } from 'commander';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

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

const _PROTOCOL_VERSION = '2025-03-26';

function send(msg: JSONRPCResponse): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const TOOLS = [
  {
    name: 'capture',
    description: 'Run a command and capture its output as a .bug artifact',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run and capture (e.g. "npm test")' },
        name: { type: 'string', description: 'Artifact name (optional)' },
        timeout: { type: 'string', description: 'Timeout in ms (default: 300000)' },
        skipSecrets: { type: 'boolean', description: 'Skip secret scanning (default: false)' },
        description: { type: 'string', description: 'Human-readable description of the bug' },
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
    description: 'Compare two .bug artifacts to find differences',
    inputSchema: {
      type: 'object',
      properties: {
        left: { type: 'string', description: 'Path to the first .bug file' },
        right: { type: 'string', description: 'Path to the second .bug file' },
      },
      required: ['left', 'right'],
    },
  },
  {
    name: 'doctor',
    description: 'Check if bugproof sandbox capabilities are available',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

function runBugproof(args: string[]): { stdout: string; stderr: string; status: number } {
  const entryPoint = process.argv[1]?.endsWith('.ts')
    ? fileURLToPath(new URL('../../dist/cli.js', import.meta.url))
    : path.resolve(process.argv[1] ?? fileURLToPath(new URL('../../dist/cli.js', import.meta.url)));
  const result = spawnSync(process.execPath, [entryPoint, ...args], {
    encoding: 'utf-8',
    timeout: 300000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, BUGPROOF_MCP: '1' },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

function handleRequest(req: JSONRPCRequest): void {
  const { id, method, params } = req;

  switch (method) {
    case 'initialize':
      send({ jsonrpc: '2.0', id, result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'bugproof', version: getVersion() },
      }});
      break;

    case 'tools/list':
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      break;

    case 'tools/call': {
      const p = params as { name: string; arguments?: Record<string, unknown> } | undefined;
      const toolName = p?.name;
      const args = p?.arguments ?? {};
      switch (toolName) {
        case 'capture':
          return handleCapture(id, args as Record<string, unknown>);
        case 'replay':
          return handleReplay(id, args as Record<string, unknown>);
        case 'inspect':
          return handleInspect(id, args as Record<string, unknown>);
        case 'diff':
          return handleDiff(id, args as Record<string, unknown>);
        case 'doctor':
          return handleDoctor(id);
        default:
          send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${toolName}` } });
      }
      break;
    }

    case 'notifications/initialized':
      send({ jsonrpc: '2.0', id, result: null });
      break;

    default:
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

function parseCommandArgs(str: string): string[] {
  const args: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    args.push(match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[0]);
  }
  return args;
}

function handleCapture(id: number | string, args: Record<string, unknown>): void {
  const cmdArgs = ['capture', '--json'];
  if (args.name) cmdArgs.push('-n', String(args.name));
  if (args.timeout) cmdArgs.push('--timeout', String(args.timeout));
  if (args.skipSecrets) cmdArgs.push('--skip-secrets');
  if (args.description) cmdArgs.push('-d', String(args.description));

  const commandStr = String(args.command ?? '');
  cmdArgs.push('--', ...parseCommandArgs(commandStr));

  const result = runBugproof(cmdArgs);
  sendResult(id, result);
}

function handleReplay(id: number | string, args: Record<string, unknown>): void {
  const artifactPath = path.resolve(String(args.artifact ?? ''));
  if (!fs.existsSync(artifactPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Artifact not found: ${artifactPath}` } });
    return;
  }
  const cmdArgs = ['replay', artifactPath, '--json'];
  sendResult(id, runBugproof(cmdArgs));
}

function handleInspect(id: number | string, args: Record<string, unknown>): void {
  const artifactPath = path.resolve(String(args.artifact ?? ''));
  if (!fs.existsSync(artifactPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Artifact not found: ${artifactPath}` } });
    return;
  }
  sendResult(id, runBugproof(['inspect', '--json', artifactPath]));
}

function handleDiff(id: number | string, args: Record<string, unknown>): void {
  const leftPath = path.resolve(String(args.left ?? ''));
  const rightPath = path.resolve(String(args.right ?? ''));
  if (!fs.existsSync(leftPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Left artifact not found: ${leftPath}` } });
    return;
  }
  if (!fs.existsSync(rightPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Right artifact not found: ${rightPath}` } });
    return;
  }
  sendResult(id, runBugproof(['diff', leftPath, rightPath, '--json']));
}

function handleDoctor(id: number | string): void {
  sendResult(id, runBugproof(['doctor', '--json']));
}

function sendResult(id: number | string, result: { stdout: string; stderr: string; status: number }): void {
  if (result.status !== 0) {
    send({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: result.stderr || result.stdout || 'Command failed' },
    });
    return;
  }
  try {
    const parsed = JSON.parse(result.stdout);
    send({ jsonrpc: '2.0', id, result: parsed });
  } catch {
    send({ jsonrpc: '2.0', id, result: { raw: result.stdout } });
  }
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    );
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

export const mcpCommand = new Command('mcp')
  .description('Start MCP server for AI-agent integration (stdio transport)')
  .action(() => {
    process.stderr.write(`bugproof-mcp: server started (pid ${process.pid})\n`);

    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line: string) => {
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

    rl.on('close', () => process.exit(0));
  });
