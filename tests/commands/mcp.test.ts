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

  it('mcp should list all 10 tools via tools/list', () => {
    const { response, stderr } = mcpRequest({
      jsonrpc: '2.0', id: 1, method: 'tools/list',
    });
    expect(stderr).toContain('server started');
    expect(response).not.toBeNull();
    expect(response!.jsonrpc).toBe('2.0');
    expect(response!.id).toBe(1);
    const result = response!.result as { tools: unknown[] };
    expect(result.tools).toHaveLength(10);
    const names = (result.tools as Array<{ name: string }>).map(t => t.name);
    expect(names).toEqual(['capture', 'replay', 'inspect', 'diff', 'doctor', 'share', 'pull', 'watch', 'list', 'clean']);
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
    const result = response!.result as { _data: { host: { os: string; platform: string } } };
    expect(result).toBeDefined();
    expect(result._data.host).toBeDefined();
    expect(['win32', 'linux', 'darwin']).toContain(result._data.host.platform);
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
    const result = response!.result as { _data: { manifest: { name: string; exit_code: number } } };
    expect(result._data.manifest).toBeDefined();
    expect(result._data.manifest.name).toBe('mcp-test-1');
    expect(result._data.manifest.exit_code).toBe(1);
  });

  it('diff tool should compare two artifacts', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 11, method: 'tools/call',
      params: { name: 'diff', arguments: { left: artifact1, right: artifact2 } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { _data: { identical: boolean; changes: unknown[] } };
    expect(result._data.identical).toBe(false);
    expect(result._data.changes.length).toBeGreaterThanOrEqual(1);
  });

  it('replay tool should reproduce a failure', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 12, method: 'tools/call',
      params: { name: 'replay', arguments: { artifact: artifact1 } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { _data: { reproduced: boolean; verdict: { status: string } } };
    expect(result._data.reproduced).toBe(true);
    expect(result._data.verdict.status).toBe('confirmed');
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
    const result = response!.result as { _data: Record<string, unknown> };
    const data = result._data;
    const rSuccess = data.success as boolean;
    const rArtifact = data.artifact as Record<string, string>;
    const rFailure = data.failure as Record<string, number>;
    expect(rSuccess).toBe(true);
    expect(rArtifact.name).toBe('mcp-capture-e2e');
    expect(rFailure.exit_code).toBe(42);

    // Clean up the captured artifact
    try { fs.unlinkSync(path.resolve(rArtifact.path)); } catch { /* ok */ }
  });

  it('share tool should error on nonexistent artifact (-32000)', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 15, method: 'tools/call',
      params: { name: 'share', arguments: { artifact: '/nonexistent.bug' } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeDefined();
    expect(response!.error!.code).toBe(-32000);
  });

  it('pull tool should error on invalid gist input', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 16, method: 'tools/call',
      params: { name: 'pull', arguments: { gist: 'invalid-gist-id' } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeDefined();
  });

  it('watch tool should capture a failing command', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 17, method: 'tools/call',
      params: { name: 'watch', arguments: { command: 'node -e process.exit(1)', name: 'mcp-watch-test', skipSecrets: true } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as Record<string, unknown>;
    const rCaptured = result.captured as boolean;
    const rArtifact = result.artifact as Record<string, string>;
    expect(rCaptured).toBe(true);
    expect(rArtifact.path).toBeDefined();

    // Clean up
    try { fs.unlinkSync(path.resolve(rArtifact.path)); } catch { /* ok */ }
  });

  it('list tool should return artifacts in current directory', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 18, method: 'tools/call',
      params: { name: 'list', arguments: { directory: __dirname } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { success: boolean; count: number; artifacts: Array<{ path: string }> };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.artifacts)).toBe(true);
  });

  it('clean tool should dry-run without deleting', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 19, method: 'tools/call',
      params: { name: 'clean', arguments: { directory: __dirname, dryRun: true } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { success: boolean; dry_run: boolean; count: number };
    expect(result.success).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(typeof result.count).toBe('number');
  });

  it('resources/list should return artifact resource template', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 20, method: 'resources/list',
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { resourceTemplates: Array<{ uriTemplate: string; name: string }> };
    expect(result.resourceTemplates).toBeDefined();
    expect(result.resourceTemplates.length).toBeGreaterThan(0);
    expect(result.resourceTemplates[0].uriTemplate).toContain('bugproof://artifact/');
  });

  it('resources/read should return artifact content for valid URI', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 21, method: 'resources/read',
      params: { uri: `bugproof://artifact/${encodeURIComponent(artifact1)}` },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { contents: Array<{ uri: string; mimeType: string; blob: string }> };
    expect(result.contents).toBeDefined();
    expect(result.contents.length).toBe(1);
    expect(result.contents[0].mimeType).toBe('application/zip');
    expect(result.contents[0].blob).toBeDefined();
  });

  it('resources/read should error on nonexistent artifact', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 22, method: 'resources/read',
      params: { uri: 'bugproof://artifact/nonexistent.bug' },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeDefined();
    expect(response!.error!.code).toBe(-32000);
  });

  it('prompts/list should return available prompts', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 23, method: 'prompts/list',
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { prompts: Array<{ name: string; description: string }> };
    expect(result.prompts).toBeDefined();
    expect(result.prompts.length).toBe(3);
    const names = result.prompts.map(p => p.name);
    expect(names).toContain('capture-failure');
    expect(names).toContain('replay-and-analyze');
    expect(names).toContain('compare-bugs');
  });

  it('prompts/get should return capture-failure prompt', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 24, method: 'prompts/get',
      params: { name: 'capture-failure', arguments: { command: 'npm test', name: 'test-bug' } },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { messages: Array<{ role: string; content: { type: string; text: string } }> };
    expect(result.messages).toBeDefined();
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].content.text).toContain('npm test');
  });

  it('prompts/get should error on unknown prompt', () => {
    const { response } = mcpRequest({
      jsonrpc: '2.0', id: 25, method: 'prompts/get',
      params: { name: 'unknown-prompt', arguments: {} },
    });
    expect(response).not.toBeNull();
    expect(response!.error).toBeDefined();
    expect(response!.error!.code).toBe(-32000);
  });
});
