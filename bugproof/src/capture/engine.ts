import { spawn, ChildProcess } from 'child_process';
import { RunConfig } from '../types/artifact';
import { FailureRecord } from '../types/failure';
import { generateExactFingerprint, extractErrorPatterns } from '../utils/fingerprint';

/**
 * Spawns the command, captures its output, and produces a FailureRecord.
 * Uses streaming to handle large output without memory issues.
 */
export async function executeAndCapture(config: RunConfig): Promise<{ failure: FailureRecord, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const command = config.command[0];
    const args = config.command.slice(1);
    
    // We keep strings in memory for v0.1 (in v0.2 this would stream directly to disk)
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let stdoutLines = 0;
    let stderrLines = 0;
    
    // Safety limit to avoid OOM: 1MB per stream
    const MAX_BUFFER_SIZE = 1024 * 1024; 

    let isTimeout = false;
    let proc: ChildProcess;

    try {
      proc = spawn(command, args, {
        cwd: config.working_directory,
        env: config.environment,
        shell: false // Prevent shell injection
      });
    } catch (err) {
      // Command not found or spawn error
      const errStr = String(err);
      resolve({
        failure: {
          exit_code: 1,
          signal: null,
          stdout_lines: 0,
          stderr_lines: 1,
          stderr_snippet: errStr,
          fingerprint: generateExactFingerprint(errStr),
          error_patterns: extractErrorPatterns(errStr),
          duration_ms: Date.now() - startTime,
          timeout: false
        },
        stdout: '',
        stderr: errStr
      });
      return;
    }

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      isTimeout = true;
      proc.kill('SIGKILL');
    }, config.timeout_ms);

    if (config.capture_output) {
      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdoutLines += (chunk.match(/\n/g) || []).length;
        if (stdoutBuffer.length < MAX_BUFFER_SIZE) {
          stdoutBuffer += chunk;
        }
      });

      proc.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderrLines += (chunk.match(/\n/g) || []).length;
        if (stderrBuffer.length < MAX_BUFFER_SIZE) {
          stderrBuffer += chunk;
        }
      });
    }

    proc.on('close', (code, signal) => {
      clearTimeout(timeoutHandle);
      
      const duration = Date.now() - startTime;
      
      // Determine snippet (last 5 lines of stderr)
      const lines = stderrBuffer.trim().split('\n');
      const snippet = lines.slice(Math.max(0, lines.length - 5)).join('\n');

      const failure: FailureRecord = {
        exit_code: code ?? 1,
        signal: signal,
        stdout_lines: stdoutLines,
        stderr_lines: stderrLines,
        stderr_snippet: snippet,
        fingerprint: generateExactFingerprint(stderrBuffer),
        error_patterns: extractErrorPatterns(stderrBuffer),
        duration_ms: duration,
        timeout: isTimeout
      };

      resolve({
        failure,
        stdout: stdoutBuffer,
        stderr: stderrBuffer
      });
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeoutHandle);
      const errStr = String(err);
      stderrBuffer += errStr;
      
      resolve({
        failure: {
          exit_code: 1,
          signal: null,
          stdout_lines: stdoutLines,
          stderr_lines: stderrLines + 1,
          stderr_snippet: errStr,
          fingerprint: generateExactFingerprint(errStr),
          error_patterns: extractErrorPatterns(errStr),
          duration_ms: Date.now() - startTime,
          timeout: false
        },
        stdout: stdoutBuffer,
        stderr: stderrBuffer
      });
    });
  });
}
