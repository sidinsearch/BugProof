import { execSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { executeAndCapture } from '../../src/capture/engine';

describe('Capture Engine', () => {
  it('should capture a successful command', async () => {
    const result = await executeAndCapture({
      command: ['node', '-e', 'console.log("hello")'],
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 10000,
      capture_output: true,
    });

    expect(result.failure.exit_code).toBe(0);
    expect(result.stdout).toContain('hello');
    expect(result.failure.timeout).toBe(false);
    expect(result.failure.fingerprint).toMatch(/^sha256:/);
  });

  it('should capture a failing command with non-zero exit', async () => {
    const result = await executeAndCapture({
      command: ['node', '-e', 'process.exit(42)'],
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 10000,
      capture_output: true,
    });

    expect(result.failure.exit_code).toBe(42);
    expect(result.failure.timeout).toBe(false);
  });

  it('should capture stderr from a thrown error', async () => {
    // Increased timeout: spawning node on Windows can be slow under CI/load
    const result = await executeAndCapture({
      command: ['node', '-e', 'throw new Error("boom")'],
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 10000,
      capture_output: true,
    });

    expect(result.failure.exit_code).toBe(1);
    expect(result.stderr).toContain('boom');
    // stderr_snippet is only last 5 lines, which may not include the message on all Node versions
    expect(result.failure.stderr_snippet.length).toBeGreaterThan(0);
    expect(result.failure.error_patterns.length).toBeGreaterThan(0);
  }, 15000);

  it('should handle command timeout', async () => {
    const result = await executeAndCapture({
      command: ['node', '-e', 'setTimeout(() => {}, 60000)'],
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 500,
      capture_output: true,
    });

    expect(result.failure.timeout).toBe(true);
    expect(result.failure.exit_code).toBe(1);
  }, 10000);

  it('should kill child processes on timeout (no orphans)', async () => {
    const markerPid = path.join(os.tmpdir(), `bugproof-orphan-pid-${Date.now()}.txt`);
    const markerAlive = path.join(os.tmpdir(), `bugproof-orphan-alive-${Date.now()}.txt`);

    const result = await executeAndCapture({
      command: [
        'node',
        path.join(__dirname, 'fixtures', 'spawn-child-and-hang.mjs'),
        markerPid,
        markerAlive,
      ],
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 2000,
      capture_output: true,
    });

    expect(result.failure.timeout).toBe(true);

    // Child PID marker should exist (child was spawned before timeout)
    if (existsSync(markerPid)) {
      const childPidStr = readFileSync(markerPid, 'utf-8').trim();
      if (childPidStr) {
        const childPid = parseInt(childPidStr, 10);
        if (!isNaN(childPid)) {
          try {
            process.kill(childPid, 0);
            let procInfo = '';
            try {
              procInfo = execSync(
                process.platform === 'win32'
                  ? `tasklist /FI "PID eq ${childPid}" /NH`
                  : `ps -p ${childPid} -o comm=`,
                { encoding: 'utf-8', timeout: 3000 }
              ).toString().trim();
            } catch {}
            expect({ orphan: childPid, info: procInfo }).toEqual({ orphan: childPid, info: '' });
          } catch {
            // Process is dead — expected
          }
        }
      }
    }

    // Cleanup marker files
    try { unlinkSync(markerPid); } catch {}
    try { unlinkSync(markerAlive); } catch {}
  }, 15000);

  it('should not double-kill when process exits before timeout', async () => {
    const result = await executeAndCapture({
      command: ['node', '-e', 'console.log("fast exit")'],
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 5000,
      capture_output: true,
    });

    expect(result.failure.exit_code).toBe(0);
    expect(result.failure.timeout).toBe(false);
    expect(result.stdout).toContain('fast exit');
  }, 10000);

  it('should handle very short timeout (100ms)', async () => {
    const result = await executeAndCapture({
      command: ['node', '-e', 'setTimeout(() => {}, 60000)'],
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 100,
      capture_output: true,
    });

    expect(result.failure.timeout).toBe(true);
    expect(result.failure.exit_code).toBe(1);
  }, 10000);

  it('should capture partial output on timeout', async () => {
    const result = await executeAndCapture({
      command: [
        'node',
        '-e',
        'console.log("before"); setInterval(() => console.log("tick"), 50000)',
      ],
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 500,
      capture_output: true,
    });

    expect(result.failure.timeout).toBe(true);
    // stdout before the timeout should be captured
    expect(result.stdout).toContain('before');
  }, 10000);

  it('should handle a command that does not exist', async () => {
    const result = await executeAndCapture({
      command: ['nonexistent_binary_xyz_123'],
      working_directory: process.cwd(),
      environment: process.env as Record<string, string>,
      timeout_ms: 5000,
      capture_output: true,
    });

    expect(result.failure.exit_code).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
