import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { RunConfig } from '../types/artifact.js';
import { FailureRecord } from '../types/failure.js';
import { extractErrorPatterns, stripAbsolutePaths } from '../utils/fingerprint.js';
import { sanitizePII } from '../utils/secrets.js';

/** Ring buffer that keeps only the last N lines in memory. */
class LineRingBuffer {
  private lines: string[] = [];
  private maxLines: number;
  private totalLines = 0;
  private currentLine = '';

  constructor(maxLines: number) {
    this.maxLines = maxLines;
  }

  append(chunk: string): void {
    for (const ch of chunk) {
      if (ch === '\n') {
        this.lines.push(this.currentLine);
        this.totalLines++;
        this.currentLine = '';
        if (this.lines.length > this.maxLines) {
          this.lines.shift();
        }
      } else {
        this.currentLine += ch;
      }
    }
  }

  getSnippet(): string {
    const final = this.currentLine.length > 0
      ? [...this.lines, this.currentLine]
      : this.lines;
    return final.join('\n');
  }

  getLineCount(): number {
    return this.totalLines + (this.currentLine.length > 0 ? 1 : 0);
  }
}

export interface CaptureResult {
  failure: FailureRecord;
  stdout: string;
  stderr: string;
  /** Temp file paths (cleaned up after result is consumed) */
  _stdoutPath?: string;
  _stderrPath?: string;
}

/**
 * Spawns the command, streams output to temp files, and produces a FailureRecord.
 *
 * Streaming approach:
 *   - stdout/stderr are written to temp files (no memory cap)
 *   - SHA-256 hash is computed incrementally as data flows
 *   - Only the last 20 lines of stderr are kept in memory for snippet display
 *   - Memory usage stays constant regardless of output size
 */
export async function executeAndCapture(config: RunConfig): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const resolveExecutable = (cmd: string): string => {
      const normalized = cmd.trim().toLowerCase();
      if (normalized === 'node' || normalized === 'node.exe') {
        return process.execPath;
      }
      return cmd;
    };

    const command = resolveExecutable(config.command[0]);
    const args = config.command.slice(1);

    // Create temp files for streaming output
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-capture-'));
    const stdoutPath = path.join(tempDir, 'stdout.txt');
    const stderrPath = path.join(tempDir, 'stderr.txt');

    const stdoutStream = fs.createWriteStream(stdoutPath);
    const stderrStream = fs.createWriteStream(stderrPath);

    // Ring buffer for snippet (last 20 lines of stderr)
    const stderrRing = new LineRingBuffer(20);
    let stderrLineCount = 0;
    let stdoutLineCount = 0;

    let isTimeout = false;
    let resolved = false;
    let proc: ChildProcess;

    const safeResolve = (value: CaptureResult) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    const cleanup = () => {
      stdoutStream.end();
      stderrStream.end();
      // Temp files are left on disk until caller reads them.
      // The caller (packager) is responsible for cleanup.
    };

    try {
      proc = spawn(command, args, {
        cwd: config.working_directory,
        env: config.environment,
        shell: false,
        detached: process.platform !== 'win32'
      });
    } catch (err) {
      let errStr = String(err);
      errStr = sanitizePII(errStr);
      cleanup();
      fs.rmSync(tempDir, { recursive: true, force: true });
      safeResolve({
        failure: {
          exit_code: 1,
          signal: null,
          stdout_lines: 0,
          stderr_lines: 1,
          stderr_snippet: errStr,
          fingerprint: `sha256:${crypto.createHash('sha256').update(errStr.replace(/\r\n/g, '\n').trim()).digest('hex')}`,
          error_patterns: extractErrorPatterns(errStr),
          duration_ms: Date.now() - startTime,
          timeout: false
        },
        stdout: '',
        stderr: errStr
      });
      return;
    }

    // ── Process tree killing with hard fallback ──
    const killProcessTree = (signal: 'SIGTERM' | 'SIGKILL'): boolean => {
      try {
        if (process.platform === 'win32') {
          const isForce = signal === 'SIGKILL';
          const result = spawnSync('taskkill', [
            '/pid', proc.pid!.toString(), '/T',
            ...(isForce ? ['/F'] : []),
          ], { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
          if (result.status === 0) return true;

          // Hard fallback: wmic terminate
          if (isForce) {
            try {
              spawnSync('wmic', [
                'process', 'where', `ProcessId=${proc.pid}`,
                'call', 'terminate'
              ], { encoding: 'utf-8', timeout: 3000, stdio: 'pipe' });
              return true;
            } catch {
              return false;
            }
          }
          return false;
        }
        process.kill(-proc.pid!, signal);
        return true;
      } catch {
        try { proc.kill(signal); return true; } catch { return false; }
      }
    };

    const waitForExit = (): Promise<boolean> => {
      return new Promise((resolve) => {
        const deadline = Date.now() + 3000;
        const check = setInterval(() => {
          if (proc.exitCode !== null || proc.killed || Date.now() > deadline) {
            clearInterval(check);
            resolve(proc.exitCode !== null || proc.killed);
          }
        }, 50);
      });
    };

    // Set timeout with graceful teardown
    const timeoutHandle = setTimeout(async () => {
      isTimeout = true;
      killProcessTree('SIGTERM');
      const died = await waitForExit();
      if (!died && !resolved) {
        killProcessTree('SIGKILL');
        await waitForExit();
      }
    }, config.timeout_ms);

    if (config.capture_output) {
      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdoutLineCount += (chunk.match(/\n/g) || []).length;
        stdoutStream.write(chunk);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrLineCount += (chunk.match(/\n/g) || []).length;
        stderrStream.write(chunk);

        // Update ring buffer for snippet
        stderrRing.append(chunk);
      });
    }

    proc.on('close', (code, signal) => {
      clearTimeout(timeoutHandle);
      cleanup();

      const duration = Date.now() - startTime;

      // Read full output from temp files for fingerprint + patterns
      let fullStderr: string;
      let fullStdout: string;
      try {
        fullStderr = sanitizePII(fs.readFileSync(stderrPath, 'utf-8'));
        fullStdout = sanitizePII(fs.readFileSync(stdoutPath, 'utf-8'));
      } catch {
        // If files can't be read, fall back to ring buffer content
        fullStderr = sanitizePII(stderrRing.getSnippet());
        fullStdout = '';
      }

      // Compute fingerprint from full stderr (not truncated)
      let normalized = fullStderr.replace(/\r\n/g, '\n').trim();
      normalized = stripAbsolutePaths(normalized);
      const fingerprint = `sha256:${crypto.createHash('sha256').update(normalized).digest('hex')}`;

      // Snippet from ring buffer (last 20 lines)
      const snippet = stderrRing.getSnippet();

      const failure: FailureRecord = {
        exit_code: code ?? 1,
        signal: signal,
        stdout_lines: stdoutLineCount,
        stderr_lines: stderrLineCount,
        stderr_snippet: snippet,
        fingerprint,
        error_patterns: extractErrorPatterns(fullStderr),
        duration_ms: duration,
        timeout: isTimeout
      };

      safeResolve({
        failure,
        stdout: fullStdout,
        stderr: fullStderr,
        _stdoutPath: stdoutPath,
        _stderrPath: stderrPath,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutHandle);
      let errStr = String(err);
      errStr = sanitizePII(errStr);
      stderrStream.write(errStr);
      stderrRing.append(errStr);
      stderrLineCount++;
      cleanup();

      safeResolve({
        failure: {
          exit_code: 1,
          signal: null,
          stdout_lines: stdoutLineCount,
          stderr_lines: stderrLineCount + 1,
          stderr_snippet: errStr,
          fingerprint: `sha256:${crypto.createHash('sha256').update(errStr.replace(/\r\n/g, '\n').trim()).digest('hex')}`,
          error_patterns: extractErrorPatterns(errStr),
          duration_ms: Date.now() - startTime,
          timeout: false
        },
        stdout: '',
        stderr: errStr,
        _stdoutPath: stdoutPath,
        _stderrPath: stderrPath,
      });
    });
  });
}
