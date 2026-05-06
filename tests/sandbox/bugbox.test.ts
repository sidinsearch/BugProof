import { createBugBox, BugBoxOptions } from '../../src/sandbox/bugbox';
import { detectCapabilities } from '../../src/sandbox/capabilities';

// We'll just mock the dependencies to verify orchestration
jest.mock('../../src/sandbox/capabilities', () => ({
  detectCapabilities: jest.fn(),
}));

jest.mock('../../src/sandbox/filesystem', () => ({
  createIsolatedDir: jest.fn(() => ({
    rootDir: '/fake/bugbox',
    filesDir: '/fake/bugbox/files',
    workspaceDir: '/fake/bugbox/workspace',
    logsDir: '/fake/bugbox/logs',
  })),
  lockDirReadOnly: jest.fn(),
  unlockDir: jest.fn(),
  cleanupIsolatedDir: jest.fn(),
}));

jest.mock('../../src/sandbox/network', () => ({
  selectNetworkStrategy: jest.fn(),
  buildNetworkIsolationArgs: jest.fn(),
  createNetworkCleanup: jest.fn(),
  addFirewallBlockRule: jest.fn(),
}));

jest.mock('../../src/sandbox/process', () => ({
  selectProcessStrategy: jest.fn(),
  buildProcessIsolationArgs: jest.fn(),
}));

jest.mock('../../src/sandbox/resources', () => ({
  selectResourceStrategy: jest.fn(),
  buildResourceIsolationArgs: jest.fn(),
}));

jest.mock('../../src/replay/sandbox', () => ({
  createSandbox: jest.fn(),
  cleanupSandbox: jest.fn(),
}));

describe('Bug-Box Orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (detectCapabilities as jest.Mock).mockReturnValue({
      platform: 'linux',
      hasUnshare: true,
      hasCgroupsV2: false,
      hasJobObjects: false,
      hasNetsh: false,
      hasSandboxExec: false,
    });
  });

  const baseOpts: BugBoxOptions = {
    level: 'workspace',
    command: ['npm', 'test'],
    sandboxOptions: {
      mode: 'current',
      originalWorkingDir: '/cwd',
      artifactPath: '/artifact',
    },
  };

  it('should run fast path when level is "workspace"', async () => {
    const { createSandbox, cleanupSandbox } = require('../../src/replay/sandbox');
    createSandbox.mockResolvedValue({
      workingDirectory: '/cwd',
      needsCleanup: false,
    });

    const result = await createBugBox(baseOpts);

    expect(result.appliedLayers).toHaveLength(0);
    expect(result.skippedLayers).toHaveLength(0);
    expect(result.networkStrategy).toBe('none');
    expect(result.runConfigOverrides).toEqual({
      working_directory: '/cwd',
    });
    
    expect(createSandbox).toHaveBeenCalledWith(baseOpts.sandboxOptions);
    
    // Cleanup shouldn't crash
    result.cleanupFn();
    expect(cleanupSandbox).toHaveBeenCalled();
  });

  it('should apply filesystem isolation when level is "isolated"', async () => {
    const { createIsolatedDir, lockDirReadOnly } = require('../../src/sandbox/filesystem');
    const { createSandbox } = require('../../src/replay/sandbox');
    const { selectNetworkStrategy, buildNetworkIsolationArgs } = require('../../src/sandbox/network');

    createSandbox.mockResolvedValue({
      workingDirectory: '/fake/bugbox/workspace',
      needsCleanup: true,
      usedFallback: true, // triggers read-only lock
    });
    selectNetworkStrategy.mockReturnValue('none');
    buildNetworkIsolationArgs.mockReturnValue({ command: ['npm', 'test'], needsPreExec: false, strategy: 'none' });

    const result = await createBugBox({ ...baseOpts, level: 'isolated' });

    expect(result.appliedLayers).toContain('filesystem');
    expect(createIsolatedDir).toHaveBeenCalled();
    // It should pass targetDir to createSandbox
    expect(createSandbox).toHaveBeenCalledWith(expect.objectContaining({
      targetDir: '/fake/bugbox/workspace',
    }));

    // If fallback was used, it should lock the files dir
    expect(lockDirReadOnly).toHaveBeenCalledWith('/fake/bugbox/files');

    expect(result.runConfigOverrides.working_directory).toBe('/fake/bugbox/workspace');
  });

  it('should apply network isolation when level is "isolated" and capabilities allow', async () => {
    const { createSandbox } = require('../../src/replay/sandbox');
    const { selectNetworkStrategy, buildNetworkIsolationArgs, createNetworkCleanup } = require('../../src/sandbox/network');

    createSandbox.mockResolvedValue({ workingDirectory: '/fake/bugbox/workspace', needsCleanup: true });
    
    selectNetworkStrategy.mockReturnValue('unshare');
    buildNetworkIsolationArgs.mockReturnValue({
      command: ['unshare', '--net', '--', 'npm', 'test'],
      needsPreExec: false,
      strategy: 'unshare',
    });
    createNetworkCleanup.mockReturnValue(jest.fn());

    const result = await createBugBox({ ...baseOpts, level: 'isolated' });

    expect(result.appliedLayers).toContain('network');
    expect(result.networkStrategy).toBe('unshare');
    expect(result.runConfigOverrides.command).toEqual(['unshare', '--net', '--', 'npm', 'test']);
  });

  it('should apply process and resources isolation in "full" mode', async () => {
    const { createSandbox } = require('../../src/replay/sandbox');
    const { selectNetworkStrategy, buildNetworkIsolationArgs, createNetworkCleanup } = require('../../src/sandbox/network');
    const { selectProcessStrategy, buildProcessIsolationArgs } = require('../../src/sandbox/process');
    const { selectResourceStrategy, buildResourceIsolationArgs } = require('../../src/sandbox/resources');

    createSandbox.mockResolvedValue({ workingDirectory: '/fake/bugbox/workspace', needsCleanup: true });
    
    selectNetworkStrategy.mockReturnValue('none');
    buildNetworkIsolationArgs.mockReturnValue({ command: ['npm', 'test'], needsPreExec: false, strategy: 'none' });
    createNetworkCleanup.mockReturnValue(jest.fn());

    selectProcessStrategy.mockReturnValue('unshare');
    buildProcessIsolationArgs.mockReturnValue(['unshare', '--pid', '--', 'npm', 'test']);

    selectResourceStrategy.mockReturnValue('cgroups');
    buildResourceIsolationArgs.mockReturnValue(['systemd-run', '--', 'unshare', '--pid', '--', 'npm', 'test']);

    const result = await createBugBox({
      ...baseOpts,
      level: 'full',
      resourceLimits: { maxMemoryMB: 256, maxCpuPercent: 50 },
    });

    expect(result.appliedLayers).toContain('process');
    expect(result.appliedLayers).toContain('resources');
    expect(result.processStrategy).toBe('unshare');
    expect(result.resourceStrategy).toBe('cgroups');
    expect(result.runConfigOverrides.command).toEqual(['systemd-run', '--', 'unshare', '--pid', '--', 'npm', 'test']);
  });
});
