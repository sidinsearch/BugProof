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
  {
    name: 'share',
    description: 'Share a .bug artifact via GitHub Gist and get a shareable URL',
    inputSchema: {
      type: 'object',
      properties: {
        artifact: { type: 'string', description: 'Path to the .bug file to share' },
        public: { type: 'boolean', description: 'Create a public gist (default: secret/unlisted)' },
      },
      required: ['artifact'],
    },
  },
  {
    name: 'pull',
    description: 'Download a .bug artifact from a GitHub Gist URL or ID',
    inputSchema: {
      type: 'object',
      properties: {
        gist: { type: 'string', description: 'Gist URL or ID (e.g. https://gist.github.com/user/abc123)' },
        output: { type: 'string', description: 'Output directory (default: current directory)' },
      },
      required: ['gist'],
    },
  },
  {
    name: 'watch',
    description: 'Run a command and auto-capture a .bug artifact only if it fails',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to watch (e.g. "npm test")' },
        name: { type: 'string', description: 'Artifact name (optional)' },
        timeout: { type: 'string', description: 'Timeout in ms (default: 300000)' },
        description: { type: 'string', description: 'Description of the bug being captured' },
        always: { type: 'boolean', description: 'Capture even on success (default: false)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'list',
    description: 'List .bug artifacts in a directory',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory to search (default: current directory)' },
        recursive: { type: 'boolean', description: 'Search subdirectories (default: false)' },
      },
    },
  },
  {
    name: 'clean',
    description: 'Remove .bug artifacts from a directory',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory to clean (default: current directory)' },
        recursive: { type: 'boolean', description: 'Include subdirectories (default: false)' },
        dryRun: { type: 'boolean', description: 'Show what would be deleted without actually deleting' },
      },
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
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'bugproof', version: getVersion() },
      }});
      break;

    case 'prompts/list':
      send({ jsonrpc: '2.0', id, result: {
        prompts: [
          {
            name: 'capture-failure',
            description: 'Capture a failing command as a .bug artifact for debugging',
            arguments: [
              { name: 'command', description: 'The failing command to capture (e.g. "npm test")', required: true },
              { name: 'name', description: 'Human-readable name for the artifact', required: false },
            ],
          },
          {
            name: 'replay-and-analyze',
            description: 'Replay a .bug artifact and analyze the failure',
            arguments: [
              { name: 'artifact', description: 'Path to the .bug artifact to replay', required: true },
            ],
          },
          {
            name: 'compare-bugs',
            description: 'Compare two .bug artifacts to find differences',
            arguments: [
              { name: 'left', description: 'Path to the first .bug artifact', required: true },
              { name: 'right', description: 'Path to the second .bug artifact', required: true },
            ],
          },
        ],
      }});
      break;

    case 'prompts/get': {
      const pp = params as { name: string; arguments?: Record<string, string> } | undefined;
      const promptName = pp?.name;
      const promptArgs = pp?.arguments ?? {};
      return handleGetPrompt(id, promptName ?? '', promptArgs);
    }

    case 'resources/list':
      send({ jsonrpc: '2.0', id, result: {
        resources: [],
        resourceTemplates: [
          {
            uriTemplate: 'bugproof://artifact/{path}',
            name: 'BugProof Artifact',
            description: 'Read the contents of a .bug artifact',
            mimeType: 'application/zip',
          },
        ],
      }});
      break;

    case 'resources/read': {
      const rp = params as { uri: string } | undefined;
      const uri = rp?.uri ?? '';
      if (uri.startsWith('bugproof://artifact/')) {
        const artifactPath = decodeURIComponent(uri.replace('bugproof://artifact/', ''));
        return handleReadArtifact(id, artifactPath);
      }
      send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Unknown resource URI: ${uri}` } });
      break;
    }

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
        case 'share':
          return handleShare(id, args as Record<string, unknown>);
        case 'pull':
          return handlePull(id, args as Record<string, unknown>);
        case 'watch':
          return handleWatch(id, args as Record<string, unknown>);
        case 'list':
          return handleList(id, args as Record<string, unknown>);
        case 'clean':
          return handleClean(id, args as Record<string, unknown>);
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

function handleShare(id: number | string, args: Record<string, unknown>): void {
  const artifactPath = path.resolve(String(args.artifact ?? ''));
  if (!fs.existsSync(artifactPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Artifact not found: ${artifactPath}` } });
    return;
  }
  const cmdArgs = ['share', '--json', artifactPath];
  if (args.public) cmdArgs.push('--public');
  sendResult(id, runBugproof(cmdArgs));
}

function handlePull(id: number | string, args: Record<string, unknown>): void {
  const cmdArgs = ['pull', '--json', String(args.gist ?? '')];
  if (args.output) cmdArgs.push('--output', String(args.output));
  sendResult(id, runBugproof(cmdArgs));
}

function handleWatch(id: number | string, args: Record<string, unknown>): void {
  const cmdArgs = ['watch', '--json'];
  if (args.name) cmdArgs.push('-n', String(args.name));
  if (args.timeout) cmdArgs.push('--timeout', String(args.timeout));
  if (args.description) cmdArgs.push('-d', String(args.description));
  if (args.always) cmdArgs.push('--always');

  const commandStr = String(args.command ?? '');
  cmdArgs.push('--', ...parseCommandArgs(commandStr));

  const result = runBugproof(cmdArgs);
  
  // Watch returns the command's exit code, not an error status
  // Parse the JSON output regardless of exit code
  try {
    const parsed = JSON.parse(result.stdout);
    send({ jsonrpc: '2.0', id, result: parsed });
  } catch {
    sendResult(id, result);
  }
}

function handleList(id: number | string, args: Record<string, unknown>): void {
  const searchDir = args.directory ? path.resolve(String(args.directory)) : process.cwd();
  const recursive = args.recursive === true;

  if (!fs.existsSync(searchDir)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Directory not found: ${searchDir}` } });
    return;
  }

  const artifacts: Array<{ path: string; size: number; modified: string }> = [];
  let totalSize = 0;

  function findArtifacts(dir: string, depth: number): void {
    if (!recursive && depth > 0) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.name.endsWith('.bug')) {
          try {
            const stat = fs.statSync(fullPath);
            artifacts.push({
              path: fullPath,
              size: stat.size,
              modified: stat.mtime.toISOString(),
            });
            totalSize += stat.size;
          } catch { /* skip */ }
        } else if (entry.isDirectory() && recursive) {
          findArtifacts(fullPath, depth + 1);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  findArtifacts(searchDir, 0);

  send({ jsonrpc: '2.0', id, result: {
    success: true,
    directory: searchDir,
    count: artifacts.length,
    total_size_bytes: totalSize,
    artifacts,
  }});
}

function handleClean(id: number | string, args: Record<string, unknown>): void {
  const searchDir = args.directory ? path.resolve(String(args.directory)) : process.cwd();
  const recursive = args.recursive === true;
  const dryRun = args.dryRun === true;

  if (!fs.existsSync(searchDir)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Directory not found: ${searchDir}` } });
    return;
  }

  const artifacts: string[] = [];
  let totalSize = 0;

  function findArtifacts(dir: string, depth: number): void {
    if (!recursive && depth > 0) return;
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
        } else if (entry.isDirectory() && recursive) {
          findArtifacts(fullPath, depth + 1);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  findArtifacts(searchDir, 0);

  if (dryRun) {
    send({ jsonrpc: '2.0', id, result: {
      success: true,
      dry_run: true,
      count: artifacts.length,
      total_size_bytes: totalSize,
      artifacts,
    }});
    return;
  }

  let deleted = 0;
  let reclaimed = 0;
  for (const artifact of artifacts) {
    try {
      const stat = fs.statSync(artifact);
      fs.rmSync(artifact, { force: true });
      deleted++;
      reclaimed += stat.size;
    } catch { /* skip */ }
  }

  send({ jsonrpc: '2.0', id, result: {
    success: true,
    cleaned: deleted,
    reclaimed_bytes: reclaimed,
  }});
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
    const content = buildContentBlocks(parsed);
    send({ jsonrpc: '2.0', id, result: content });
  } catch {
    send({ jsonrpc: '2.0', id, result: { raw: result.stdout } });
  }
}

function buildContentBlocks(data: Record<string, unknown>): { content: Array<{ type: string; text: string }>; _data: Record<string, unknown> } {
  const lines: string[] = [];
  
  if (data.success === true) {
    lines.push('✓ Operation successful');
  } else if (data.success === false) {
    lines.push('✗ Operation failed');
  }
  
  if (data.artifact) {
    const artifact = data.artifact as Record<string, unknown>;
    if (artifact.name) lines.push(`Artifact: ${artifact.name}`);
    if (artifact.path) lines.push(`Path: ${artifact.path}`);
  }
  
  if (data.failure) {
    const failure = data.failure as Record<string, unknown>;
    if (typeof failure.exit_code === 'number') {
      lines.push(`Exit code: ${failure.exit_code}`);
    }
    if (Array.isArray(failure.error_patterns) && failure.error_patterns.length > 0) {
      lines.push(`Error patterns: ${(failure.error_patterns as string[]).join(', ')}`);
    }
  }
  
  if (data.reproduced === true) {
    lines.push('Bug reproduced successfully');
  } else if (data.reproduced === false) {
    lines.push('Bug could not be reproduced');
  }
  
  if (data.verdict) {
    const verdict = data.verdict as Record<string, unknown>;
    if (verdict.status) lines.push(`Verdict: ${verdict.status}`);
  }
  
  if (data.url) {
    lines.push(`URL: ${data.url}`);
  }
  
  if (data.count !== undefined) {
    lines.push(`Count: ${data.count}`);
  }
  
  if (data.cleaned !== undefined) {
    lines.push(`Cleaned: ${data.cleaned} artifact(s)`);
  }
  
  if (data.reclaimed_bytes !== undefined) {
    const kb = (data.reclaimed_bytes as number) / 1024;
    lines.push(`Reclaimed: ${kb.toFixed(1)} KB`);
  }
  
  return {
    content: [
      { type: 'text', text: lines.join('\n') },
      { type: 'text', text: JSON.stringify(data, null, 2) },
    ],
    _data: data,
  };
}

function handleGetPrompt(id: number | string, name: string, args: Record<string, string>): void {
  switch (name) {
    case 'capture-failure': {
      const command = args.command ?? '';
      const artifactName = args.name ?? `bug-${Date.now()}`;
      send({ jsonrpc: '2.0', id, result: {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Capture the failing command "${command}" as a .bug artifact named "${artifactName}". Use the capture tool with --skip-secrets for safety.`,
            },
          },
        ],
      }});
      break;
    }
    case 'replay-and-analyze': {
      const artifact = args.artifact ?? '';
      send({ jsonrpc: '2.0', id, result: {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Replay the .bug artifact at "${artifact}" and analyze the failure. First use inspect to get metadata, then replay to reproduce. Summarize the root cause and suggest fixes.`,
            },
          },
        ],
      }});
      break;
    }
    case 'compare-bugs': {
      const left = args.left ?? '';
      const right = args.right ?? '';
      send({ jsonrpc: '2.0', id, result: {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Compare the two .bug artifacts "${left}" and "${right}" to find differences. Use the diff tool and explain what changed between the two captures.`,
            },
          },
        ],
      }});
      break;
    }
    default:
      send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Prompt not found: ${name}` } });
  }
}

function handleReadArtifact(id: number | string, artifactPath: string): void {
  const resolvedPath = path.resolve(artifactPath);
  if (!fs.existsSync(resolvedPath)) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Artifact not found: ${resolvedPath}` } });
    return;
  }

  try {
    const content = fs.readFileSync(resolvedPath);
    const base64Content = content.toString('base64');
    send({ jsonrpc: '2.0', id, result: {
      contents: [
        {
          uri: `bugproof://artifact/${encodeURIComponent(resolvedPath)}`,
          mimeType: 'application/zip',
          blob: base64Content,
        },
      ],
    }});
  } catch (err) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: `Failed to read artifact: ${(err as Error).message}` } });
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
