import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const CLI = path.resolve(__dirname, '../../dist/cli.js');
const TIMEOUT = 30000;

interface JSONRPC {
  jsonrpc: '2.0';
  id: number | string;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
  params?: Record<string, unknown>;
}

let artifact1: string;
let artifact2: string;

function mcpRequest(request: JSONRPC): { response: JSONRPC | null; stderr: string } {
  const proc = spawnSync('node', [CLI, 'mcp'], {
    encoding: 'utf-8',
    timeout: TIMEOUT,
    input: JSON.stringify(request) + '\n',
    env: { ...process.env },
  });
  let response: JSONRPC | null = null;
  for (const line of (proc.stdout || '').trim().split('\n')) {
    try {
      response = JSON.parse(line);
      break;
    } catch { /* skip non-JSON lines */ }
  }
  return { response, stderr: proc.stderr || '' };
}

function captureArtifact(name: string, args: string[]): string {
  const r = spawnSync('node', [CLI, 'capture', '-n', name, '--json', '--skip-secrets', '--', ...args], {
    encoding: 'utf-8',
    timeout: TIMEOUT,
    cwd: __dirname,
  });
  try {
    const parsed = JSON.parse(r.stdout || '');
    if (parsed.artifact?.path) return parsed.artifact.path;
  } catch { /* not single JSON object */ }
  for (const line of (r.stdout || '').split('\n')) {
    try {
      const parsed = JSON.parse(line.trim());
      if (parsed.artifact?.path) return parsed.artifact.path;
    } catch { /* skip */ }
  }
  throw new Error(`Capture failed: ${r.stdout?.substring(0, 200)}`);
}

beforeAll(() => {
  artifact1 = captureArtifact('mcp-test-1', ['node', '-e', 'process.exit(1)']);
  artifact2 = captureArtifact('mcp-test-2', ['node', '-e', 'console.log("hello")']);
});

afterAll(() => {
  try { fs.unlinkSync(artifact1); } catch { /* ok */ }
  try { fs.unlinkSync(artifact2); } catch { /* ok */ }
});

describe('MCP Server', () => {
  it('mcp --help should show the mcp command', () => {
    const r = spawnSync('node', [CLI, 'mcp', '--help'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('MCP server');
  });

  it('mcp should list all 5 tools via tools/list', () => {
    const { response, stderr } = mcpRequest({
      jsonrpc: '2.0', id: 1, method: 'tools/list',
    });
    expect(stderr).toContain('server started');
    expect(response).not.toBeNull();
    expect(response!.jsonrpc).toBe('2.0');
    expect(response!.id).toBe(1);
    const result = response!.result as { tools: unknown[] };
    expect(result.tools).toHaveLength(5);
    const names = (result.tools as Array<{ name: string }>).map(t => t.name);
    expect(names).toEqual(['capture', 'replay', 'inspect', 'diff', 'doctor']);
  });

  it('mcp should respond to initialize request', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 2, method: 'initialize',
    });
    expect(response).not.toBeNull();
    expect(response!.result).toBeDefined();
    const result = response!.result as { serverInfo: { name: string; version: string } };
    expect(result.serverInfo.name).toBe('bugproof');
    expect(result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('mcp should error for unknown method (-32601)', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 3, method: 'nonexistent',
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeDefined();
    expect(response!.error!.code).toBe(-32601);
  });

  it('mcp should error for malformed JSON (-32700)', () => {
    const proc = spawnSync('node', [CLI, 'mcp'], {
      encoding: 'utf-8',
      timeout: 10000,
      input: 'not-json\n',
      env: { ...process.env },
    });
    for (const line of (proc.stdout || '').trim().split('\n')) {
      try {
        const resp = JSON.parse(line) as JSONRPC;
        if (resp.error) {
          expect(resp.error.code).toBe(-32700);
          return;
        }
      } catch { /* skip */ }
    }
    expect(true).toBe(false);
  });

  it('doctor should return sandbox capabilities', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'doctor', arguments: {} },
    });
    expect(response).not.toBeNull();
    expect(response!.jsonrpc).toBe('2.0');
    expect(response!.id).toBe(4);
    const result = response!.result as { host: { os: string; platform: string } };
    expect(result).toBeDefined();
    expect(result.host).toBeDefined();
    expect(['win32', 'linux', 'darwin']).toContain(result.host.platform);
  });

  it('should error for unknown tool name (-32601)', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'unknown_tool', arguments: {} },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeDefined();
    expect(response!.error!.code).toBe(-32601);
  });

  it('capture tool should require command argument', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'capture', arguments: {} },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeDefined();
  });

  it('inspect tool should error on nonexistent artifact (-32000)', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'inspect', arguments: { artifact: '/nonexistent/path.bug' } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeDefined();
    expect(response!.error!.code).toBe(-32000);
  });

  it('diff tool should error on missing artifacts (-32000)', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'diff', arguments: { left: '/missing.bug', right: '/missing2.bug' } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeDefined();
    expect(response!.error!.code).toBe(-32000);
  });

  it('each tool in TOOLS should have valid inputSchema', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 9, method: 'tools/list',
    });
    expect(response).not.toBeNull();
    const result = response!.result as { tools: Array<{ name: string; inputSchema: { type: string } }> };
    for (const tool of result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('inspect tool should return artifact metadata', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 10, method: 'tools/call',
      params: { name: 'inspect', arguments: { artifact: artifact1 } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { manifest: { name: string; exit_code: number } };
    expect(result.manifest).toBeDefined();
    expect(result.manifest.name).toBe('mcp-test-1');
    expect(result.manifest.exit_code).toBe(1);
  });

  it('diff tool should compare two artifacts', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 11, method: 'tools/call',
      params: { name: 'diff', arguments: { left: artifact1, right: artifact2 } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { identical: boolean; changes: unknown[] };
    expect(result.identical).toBe(false);
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
  });

  it('replay tool should reproduce a failure', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 12, method: 'tools/call',
      params: { name: 'replay', arguments: { artifact: artifact1 } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { reproduced: boolean; verdict: { status: string } };
    expect(result.reproduced).toBe(true);
    expect(result.verdict.status).toBe('confirmed');
  });

  it('tools/notifications is not supported (responds with result null)', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 13, method: 'notifications/initialized',
    });
    expect(response).not.toBeNull();
    expect(response!.result).toBeNull();
  });

  it('capture tool should create an artifact from a command', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 14, method: 'tools/call',
      params: { name: 'capture', arguments: { command: 'node -e process.exit(42)', name: 'mcp-capture-e2e', skipSecrets: true } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as Record<string, unknown>;
    const rSuccess = result.success as boolean;
    const rArtifact = result.artifact as Record<string, string>;
    const rFailure = result.failure as Record<string, number>;
    expect(rSuccess).toBe(true);
    expect(rArtifact.name).toBe('mcp-capture-e2e');
    expect(rFailure.exit_code).toBe(42);

    // Clean up the captured artifact
    try { fs.unlinkSync(path.resolve(rArtifact.path)); } catch { /* ok */ }
  });
});
