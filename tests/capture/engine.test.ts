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
