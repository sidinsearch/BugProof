import { replayArtifact, ReplayOptions } from '../../src/replay/engine.js';
import { RunConfig } from '../../src/types/artifact.js';
import { FailureRecord } from '../../src/types/failure.js';
import * as engine from '../../src/capture/engine.js';
import * as bugbox from '../../src/sandbox/bugbox.js';
import * as crossPlatform from '../../src/sandbox/cross-platform.js';

jest.mock('../../src/capture/engine.js');
jest.mock('../../src/sandbox/bugbox.js');
jest.mock('../../src/utils/security.js', () => ({
  sanitizeArtifactEnvironment: (env: Record<string, string>) => ({ ...env }),
}));
jest.mock('../../src/sandbox/cross-platform.js');

const mockExecuteAndCapture = engine.executeAndCapture as jest.Mock;
const mockCreateBugBox = bugbox.createBugBox as jest.Mock;
const mockDetectCrossPlatform = crossPlatform.detectCrossPlatform as jest.Mock;
const mockTranslateCommand = crossPlatform.translateCommand as jest.Mock;
const mockTranslateEnvironment = crossPlatform.translateEnvironment as jest.Mock;

function makeRunConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    command: ['node', 'crash.js'],
    working_directory: '/tmp/test',
    environment: { PATH: '/usr/bin' },
    timeout_ms: 30000,
    capture_output: true,
    ...overrides,
  };
}

function makeFailure(overrides: Partial<FailureRecord> = {}): FailureRecord {
  return {
    exit_code: 1, signal: null, stdout_lines: 0, stderr_lines: 1,
    stderr_snippet: 'Error: boom', fingerprint: 'sha256:abc',
    error_patterns: ['Error'], duration_ms: 100, timeout: false,
    ...overrides,
  };
}

function mockBugBoxResult(overrides: Record<string, unknown> = {}) {
  return {
    sandboxResult: { workingDirectory: '/tmp/sandbox', usedFallback: false },
    capabilities: { platform: 'win32', osRelease: '10', arch: 'x64', hasGit: true, hasNetwork: false, hasProcess: false },
    appliedLayers: ['filesystem'],
    skippedLayers: ['network', 'process'],
    networkStrategy: 'none', processStrategy: 'none', resourceStrategy: 'none',
    isolatedDir: undefined,
    runConfigOverrides: { working_directory: '/tmp/sandbox' },
    cleanupFn: jest.fn(),
    ...overrides,
  };
}

function makeReplayOpts(overrides: Partial<ReplayOptions> = {}): ReplayOptions {
  return {
    artifactPath: '/tmp/artifact.bug',
    versionMatch: 'current',
    envOverrides: {},
    ...overrides,
  };
}

describe('Replay Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateBugBox.mockResolvedValue(mockBugBoxResult());
    mockExecuteAndCapture.mockResolvedValue({
      failure: makeFailure({ fingerprint: 'sha256:replayed' }),
      stdout: '', stderr: 'Error: boom',
    });
    mockDetectCrossPlatform.mockReturnValue({
      needsTranslation: false, translationMap: {}, warnings: [],
    });
  });

  it('should replay and return actual vs expected failure', async () => {
    const expected = makeFailure();
    const result = await replayArtifact(makeRunConfig(), expected, makeReplayOpts());

    expect(result.actualFailure).toBeDefined();
    expect(result.expectedFailure).toBe(expected);
    expect(result.actualFailure.fingerprint).toBe('sha256:replayed');
    expect(result.replayDirectory).toBe('/tmp/sandbox');
  });

  it('should clean up sandbox after replay', async () => {
    const cleanupFn = jest.fn();
    mockCreateBugBox.mockResolvedValue(mockBugBoxResult({ cleanupFn }));

    await replayArtifact(makeRunConfig(), makeFailure(), makeReplayOpts());

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should clean up sandbox even when replay fails', async () => {
    const cleanupFn = jest.fn();
    mockCreateBugBox.mockResolvedValue(mockBugBoxResult({ cleanupFn }));
    mockExecuteAndCapture.mockRejectedValue(new Error('replay crashed'));

    await expect(
      replayArtifact(makeRunConfig(), makeFailure(), makeReplayOpts()),
    ).rejects.toThrow('replay crashed');

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should apply cross-platform translation when needed', async () => {
    mockDetectCrossPlatform.mockReturnValue({
      needsTranslation: true, translationMap: { python3: 'python' }, warnings: [],
    });
    mockTranslateCommand.mockReturnValue({
      command: ['python', 'script.py'],
      translations: ['python3 → python'], blockers: [],
    });
    mockTranslateEnvironment.mockReturnValue({
      environment: { PATH: '/usr/bin', VIRTUAL_ENV: '/venv' },
      translations: ['Added VIRTUAL_ENV'], blockers: [],
    });
    mockExecuteAndCapture.mockResolvedValue({
      failure: makeFailure({ fingerprint: 'sha256:cross' }),
      stdout: '', stderr: 'Error',
    });

    const result = await replayArtifact(
      makeRunConfig({ command: ['python3', 'script.py'] }),
      makeFailure(),
      makeReplayOpts({ capturedPlatform: 'linux' }),
    );

    expect(result.crossPlatform).toBeDefined();
    expect(result.crossPlatform!.needsTranslation).toBe(true);
    expect(result.crossPlatform!.translations).toContain('python3 → python');
    expect(mockTranslateCommand).toHaveBeenCalled();
    expect(mockTranslateEnvironment).toHaveBeenCalled();
  });

  it('should propagate BugBox result info', async () => {
    mockCreateBugBox.mockResolvedValue(mockBugBoxResult({
      appliedLayers: ['filesystem', 'network'],
      skippedLayers: ['process'],
    }));

    const result = await replayArtifact(
      makeRunConfig(), makeFailure(), makeReplayOpts({ sandboxLevel: 'isolated' }),
    );

    expect(result.bugBox).toBeDefined();
    expect(result.bugBox!.level).toBe('isolated');
    expect(result.bugBox!.appliedLayers).toContain('filesystem');
    expect(result.bugBox!.skippedLayers).toContain('process');
  });

  it('should use workspace sandbox level by default', async () => {
    await replayArtifact(makeRunConfig(), makeFailure(), makeReplayOpts());

    expect(mockCreateBugBox).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'workspace' }),
    );
  });

  it('should preserve host PATH in replay environment', async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = '/custom/bin:/usr/bin';

    await replayArtifact(makeRunConfig(), makeFailure(), makeReplayOpts());

    expect(mockExecuteAndCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: expect.objectContaining({ PATH: '/custom/bin:/usr/bin' }),
      }),
    );

    process.env.PATH = originalPath;
  });
});
