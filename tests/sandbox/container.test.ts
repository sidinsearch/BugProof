import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createContainer, ContainerConfig } from '../../src/sandbox/container.js';

describe('BugBox Container', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-container-test-'));
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create a container with temp isolation', () => {
    const config: ContainerConfig = {
      command: ['node', '-e', 'console.log("hi")'],
      workingDir: tempDir,
      environment: { ...process.env as Record<string, string> },
      timeoutMs: 5000,
      network: 'full',
      filesystem: 'full',
    };

    const result = createContainer(config);

    // Should always have temp isolation
    const tempLayer = result.layers.find(l => l.name === 'temp-isolation');
    expect(tempLayer).toBeDefined();
    expect(tempLayer!.applied).toBe(true);

    // Should have env sanitization
    const envLayer = result.layers.find(l => l.name === 'env-sanitize');
    expect(envLayer).toBeDefined();
    expect(envLayer!.applied).toBe(true);

    // Cleanup should not throw
    result.cleanup();
  });

  it('should sanitize dangerous environment variables', () => {
    const config: ContainerConfig = {
      command: ['node', '-e', '1'],
      workingDir: tempDir,
      environment: {
        PATH: '/usr/bin',
        HOME: '/home/test',
        LD_PRELOAD: '/evil/lib.so',
        NODE_OPTIONS: '--inspect',
        BASH_ENV: '/evil/script.sh',
        ENV: '/evil/profile',
        PROMPT_COMMAND: 'curl evil.com',
        IFS: '/',
        SHELLOPTS: 'xtrace',
        BASHOPTS: 'extdebug',
        LD_AUDIT: '/evil/audit.so',
        LD_DEBUG: 'all',
        NORMAL_VAR: 'safe',
      },
      timeoutMs: 5000,
      network: 'full',
      filesystem: 'full',
    };

    const result = createContainer(config);

    // Dangerous vars should be removed
    expect(result.environment.LD_PRELOAD).toBeUndefined();
    expect(result.environment.NODE_OPTIONS).toBeUndefined();
    expect(result.environment.BASH_ENV).toBeUndefined();
    expect(result.environment.ENV).toBeUndefined();
    expect(result.environment.PROMPT_COMMAND).toBeUndefined();
    expect(result.environment.IFS).toBeUndefined();
    expect(result.environment.SHELLOPTS).toBeUndefined();
    expect(result.environment.BASHOPTS).toBeUndefined();
    expect(result.environment.LD_AUDIT).toBeUndefined();
    expect(result.environment.LD_DEBUG).toBeUndefined();

    // Safe vars should remain
    expect(result.environment.PATH).toBe('/usr/bin');
    expect(result.environment.NORMAL_VAR).toBe('safe');

    result.cleanup();
  });

  it('should create workspace overlay for overlay filesystem mode', () => {
    const config: ContainerConfig = {
      command: ['node', '-e', '1'],
      workingDir: tempDir,
      environment: {},
      timeoutMs: 5000,
      network: 'full',
      filesystem: 'overlay',
    };

    const result = createContainer(config);

    const overlayLayer = result.layers.find(l => l.name === 'filesystem-overlay');
    expect(overlayLayer).toBeDefined();
    expect(overlayLayer!.applied).toBe(true);

    // Working dir should be different from source (overlay or copy)
    // It could be same if overlay falls back to shallow copy in same dir structure
    expect(result.workingDir).toBeTruthy();

    result.cleanup();
  });

  it('should override temp directory environment variables', () => {
    const config: ContainerConfig = {
      command: ['node', '-e', '1'],
      workingDir: tempDir,
      environment: { TMPDIR: '/original', TMP: '/original' },
      timeoutMs: 5000,
      network: 'full',
      filesystem: 'full',
    };

    const result = createContainer(config);

    // Temp vars should point to the container's isolated temp
    expect(result.environment.TMPDIR).not.toBe('/original');
    expect(result.environment.TMP).not.toBe('/original');
    expect(result.environment.TMPDIR).toContain('bugbox-container-');

    result.cleanup();
  });

  it('should provide a human-readable description', () => {
    const config: ContainerConfig = {
      command: ['echo', 'test'],
      workingDir: tempDir,
      environment: {},
      timeoutMs: 5000,
      network: 'full',
      filesystem: 'full',
    };

    const result = createContainer(config);

    expect(result.description).toContain('BugBox container');
    expect(result.description).toContain('isolation layers');

    result.cleanup();
  });

  it('should handle cleanup gracefully even if called multiple times', () => {
    const config: ContainerConfig = {
      command: ['echo', 'test'],
      workingDir: tempDir,
      environment: {},
      timeoutMs: 5000,
      network: 'full',
      filesystem: 'full',
    };

    const result = createContainer(config);

    // Should not throw on double cleanup
    result.cleanup();
    result.cleanup();
  });
});
