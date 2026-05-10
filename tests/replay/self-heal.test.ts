/**
 * Self-heal replay tests.
 *
 * Mocks replay engine + child_process.spawnSync so the suite is hermetic.
 * Focus: orchestration in selfHealReplay — detect missing deps from stderr,
 * install via spawn, retry, track attempts, cap rounds, bail on no progress.
 */
import { ReplayResult } from '../../src/replay/engine';
import { FailureRecord } from '../../src/types/failure';
import { RunConfig } from '../../src/types/artifact';

jest.mock('../../src/replay/engine', () => ({
  replayArtifact: jest.fn(),
}));
jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
}));
jest.mock('fs', () => {
  // Self-heal only uses existsSync + writeFileSync. Forward everything else to real fs
  // (ts-jest itself reads source files via fs).
  const real = jest.requireActual('fs');
  return {
    ...real,
    existsSync: jest.fn((...args) => real.existsSync(...args)),
    writeFileSync: jest.fn((...args) => real.writeFileSync(...args)),
  };
});

// Pull the now-mocked references.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const engineModule = require('../../src/replay/engine');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cpModule = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsModule = require('fs');
const replayArtifactMock: jest.Mock = engineModule.replayArtifact;
const spawnSyncMock: jest.Mock = cpModule.spawnSync;
const existsSyncMock: jest.Mock = fsModule.existsSync;

// Import after mocks are set.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { selfHealReplay, MAX_HEAL_ROUNDS } = require('../../src/replay/self-heal');

function fixtureFailure(overrides: Partial<FailureRecord> = {}): FailureRecord {
  return {
    exit_code: 1,
    signal: null,
    stdout_lines: 0,
    stderr_lines: 1,
    stderr_snippet: '',
    fingerprint: 'sha256:expected',
    error_patterns: ['ModuleNotFoundError'],
    duration_ms: 1,
    timeout: false,
    ...overrides,
  };
}

function fixtureReplayResult(overrides: Partial<ReplayResult>): ReplayResult {
  return {
    actualFailure: fixtureFailure({ fingerprint: 'sha256:different' }),
    expectedFailure: fixtureFailure(),
    actualStdout: '',
    actualStderr: '',
    replayDirectory: '/tmp/sandbox',
    ...overrides,
  };
}

const runConfig: RunConfig = {
  command: ['node', 'app.js'],
  working_directory: '/tmp/proj',
  environment: {},
  timeout_ms: 1000,
  capture_output: true,
};

beforeEach(() => {
  replayArtifactMock.mockReset();
  spawnSyncMock.mockReset();
  // Pretend package.json already exists at the (mocked) cwd so self-heal doesn't
  // try to scaffold one — that branch is exercised separately if needed.
  existsSyncMock.mockReset();
  existsSyncMock.mockReturnValue(true);
});

describe('selfHealReplay', () => {
  it('returns immediately when the first replay confirms reproduction', async () => {
    const expected = fixtureFailure();
    replayArtifactMock.mockResolvedValueOnce(
      fixtureReplayResult({ expectedFailure: expected, actualFailure: expected }),
    );

    const result = await selfHealReplay(runConfig, expected, {
      artifactPath: '/x',
      versionMatch: 'current',
      envOverrides: {},
    });

    expect(replayArtifactMock).toHaveBeenCalledTimes(1);
    expect(result.attempts).toEqual([]);
    expect(result.healed).toBe(false);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('installs a missing npm module and retries when first replay fails differently', async () => {
    // Expected reproduction = the canonical ModuleNotFoundError fingerprint.
    // First replay returns a *different* error (raw "Cannot find module"
    // from Node, which doesn't match the captured pattern), so we trigger
    // healing. Second replay returns the expected fingerprint => confirmed.
    const expected = fixtureFailure();

    replayArtifactMock
      .mockResolvedValueOnce(
        fixtureReplayResult({
          actualStderr: "Error: Cannot find module 'redis'",
          actualFailure: fixtureFailure({
            fingerprint: 'sha256:miss',
            error_patterns: ['ERR_MODULE_NOT_FOUND'],
          }),
        }),
      )
      .mockResolvedValueOnce(
        fixtureReplayResult({ actualFailure: expected }),
      );

    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });

    const result = await selfHealReplay(runConfig, expected, {
      artifactPath: '/x',
      versionMatch: 'current',
      envOverrides: {},
    });

    expect(replayArtifactMock).toHaveBeenCalledTimes(2);
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);

    const npmCall = spawnSyncMock.mock.calls[0];
    expect(npmCall[0]).toBe('npm');
    expect(npmCall[1]).toEqual(expect.arrayContaining(['install', 'redis']));

    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].installed).toContain('node:redis');
    expect(result.attempts[0].verdictStatus).toBe('confirmed');
    expect(result.healed).toBe(true);
  });

  it('caps at MAX_HEAL_ROUNDS when new deps keep appearing', async () => {
    const expected = fixtureFailure();
    const errors = ['redis', 'foo', 'bar', 'baz', 'qux'];
    for (const mod of errors) {
      replayArtifactMock.mockResolvedValueOnce(
        fixtureReplayResult({
          actualStderr: `Error: Cannot find module '${mod}'`,
          actualFailure: fixtureFailure({
            fingerprint: 'sha256:miss',
            error_patterns: ['ERR_MODULE_NOT_FOUND'],
          }),
        }),
      );
    }
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '' });

    const result = await selfHealReplay(runConfig, expected, {
      artifactPath: '/x',
      versionMatch: 'current',
      envOverrides: {},
    });

    expect(result.attempts.length).toBeLessThanOrEqual(MAX_HEAL_ROUNDS);
    expect(replayArtifactMock.mock.calls.length).toBeLessThanOrEqual(MAX_HEAL_ROUNDS + 1);
    expect(result.healed).toBe(false);
  });

  it('bails out when stderr has no installable deps', async () => {
    const expected = fixtureFailure();
    replayArtifactMock.mockResolvedValueOnce(
      fixtureReplayResult({
        actualStderr: 'some unrelated runtime error',
        actualFailure: fixtureFailure({
          fingerprint: 'sha256:miss',
          error_patterns: ['ERR_UNRELATED'],
        }),
      }),
    );

    const result = await selfHealReplay(runConfig, expected, {
      artifactPath: '/x',
      versionMatch: 'current',
      envOverrides: {},
    });

    expect(replayArtifactMock).toHaveBeenCalledTimes(1);
    expect(spawnSyncMock).not.toHaveBeenCalled();
    expect(result.attempts).toEqual([]);
    expect(result.healed).toBe(false);
  });

  it('records failed installs and stops without further retries', async () => {
    const expected = fixtureFailure();

    replayArtifactMock.mockResolvedValueOnce(
      fixtureReplayResult({
        actualStderr: "Error: Cannot find module 'broken'",
        actualFailure: fixtureFailure({
          fingerprint: 'sha256:miss',
          error_patterns: ['ERR_MODULE_NOT_FOUND'],
        }),
      }),
    );

    // npm install fails — non-zero status.
    spawnSyncMock.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'npm error' });

    const result = await selfHealReplay(runConfig, expected, {
      artifactPath: '/x',
      versionMatch: 'current',
      envOverrides: {},
    });

    expect(result.attempts.length).toBe(1);
    expect(result.attempts[0].failedToInstall).toContain('node:broken');
    expect(result.attempts[0].installed).toEqual([]);
    expect(result.healed).toBe(false);
    // Only the initial replay — no retry after install failure.
    expect(replayArtifactMock).toHaveBeenCalledTimes(1);
  });

  it('passes safe install flags to npm (no shell metacharacters)', async () => {
    const expected = fixtureFailure();

    replayArtifactMock
      .mockResolvedValueOnce(
        fixtureReplayResult({
          actualStderr: "Error: Cannot find module 'left-pad'",
          actualFailure: fixtureFailure({
            fingerprint: 'sha256:miss',
            error_patterns: ['ERR_MODULE_NOT_FOUND'],
          }),
        }),
      )
      .mockResolvedValueOnce(fixtureReplayResult({ actualFailure: expected }));

    spawnSyncMock.mockReturnValueOnce({ status: 0 });

    await selfHealReplay(runConfig, expected, {
      artifactPath: '/x',
      versionMatch: 'current',
      envOverrides: {},
    });

    const args = spawnSyncMock.mock.calls[0][1] as string[];
    expect(args).toEqual(expect.arrayContaining(['install', 'left-pad']));
    for (const a of args) {
      expect(a).not.toMatch(/[;&|`$]/);
    }
  });
});
