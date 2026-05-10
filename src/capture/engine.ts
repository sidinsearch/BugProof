import { spawn, ChildProcess } from 'child_process';
import { RunConfig } from '../types/artifact.js';
import { FailureRecord } from '../types/failure.js';
import { generateExactFingerprint, extractErrorPatterns } from '../utils/fingerprint.js';
import { sanitizePII } from '../utils/secrets.js';


/**
 * Spawns the command, captures its output, and produces a FailureRecord.
 * Uses streaming to handle large output without memory issues.
 */
export async function executeAndCapture(config: RunConfig): Promise<{ failure: FailureRecord, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Define resolveExecutable first, before using it
    const resolveExecutable = (cmd: string): string => {
      const normalized = cmd.trim().toLowerCase();
      if (normalized === 'node' || normalized === 'node.exe') {
        return process.execPath;
      }
      return cmd;
    };
    
    const command = resolveExecutable(config.command[0]);
    const args = config.command.slice(1);
    
    // We keep strings in memory for v0.1 (in v0.2 this would stream directly to disk)
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let stdoutLines = 0;
    let stderrLines = 0;
    
    // Safety limit to avoid OOM: 1MB per stream
    const MAX_BUFFER_SIZE = 1024 * 1024; 

    let isTimeout = false;
    let resolved = false;
    let proc: ChildProcess;

    const safeResolve = (value: { failure: FailureRecord, stdout: string, stderr: string }) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    try {
      proc = spawn(command, args, {
        cwd: config.working_directory,
        env: config.environment,
        shell: false // Prevent shell injection
      });
    } catch (err) {
      // Command not found or spawn error
      let errStr = String(err);
      errStr = sanitizePII(errStr);
      safeResolve({
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
      
      stdoutBuffer = sanitizePII(stdoutBuffer);
      stderrBuffer = sanitizePII(stderrBuffer);

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

      safeResolve({
        failure,
        stdout: stdoutBuffer,
        stderr: stderrBuffer
      });
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeoutHandle);
      let errStr = String(err);
      errStr = sanitizePII(errStr);
      stderrBuffer += errStr;
      
      safeResolve({
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
