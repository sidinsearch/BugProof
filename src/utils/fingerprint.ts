import * as crypto from 'crypto';

/**
 * Strips OS-specific absolute file paths from text so that the same error
 * produces the same fingerprint regardless of where it was captured.
 *
 * Targets:
 *   - Windows: C:\Users\foo\project\file.js  → <PATH>/file.js
 *   - Linux:   /home/foo/project/file.js     → <PATH>/file.js
 *   - Node internal: node:internal/...       → left as-is (already portable)
 */
function stripAbsolutePaths(text: string): string {
  // Windows absolute paths: drive letter + backslash paths
  // e.g. D:\BugProof\bugproof\tests\e2e\fixtures\syntax-error.js → <PATH>/syntax-error.js
  let result = text.replace(/[A-Z]:\\(?:[^\s:()]+\\)*([^\s:()\\]+)/gi, '<PATH>/$1');

  // Unix absolute paths: /home/user/.../file.ext or /tmp/...
  // Capture the last path segment (the filename)
  result = result.replace(/(?:home|tmp|usr|var|opt|root|private)(?:[^\s:()]+)*([^\s:()]+)/g, '<PATH>/$1');

  return result;
}

/**
 * Generates a SHA-256 fingerprint from stderr/stdout output.
 * This provides the exact match hash for deterministic failures.
 *
 * Normalizes:
 *   - Line endings (\r\n → \n)
 *   - Absolute file paths (stripped to basename)
 *   - Trailing whitespace
 */
export function generateExactFingerprint(stderr: string): string {
  const hash = crypto.createHash('sha256');
  let normalized = stderr.replace(/\r\n/g, '\n').trim();
  // Strip OS-specific paths so cross-platform fingerprints match
  normalized = stripAbsolutePaths(normalized);
  hash.update(normalized);
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Extracts common error patterns from stderr (e.g., Exception names)
 * This provides the fuzzy fallback for non-deterministic failures (like memory addresses).
 */
export function extractErrorPatterns(stderr: string): string[] {
  const patterns: string[] = [];
  
  // Look for common exception formats (e.g. "NameError: ...", "Exception in thread ...")
  const exceptionRegex = /([A-Z][a-zA-Z0-9]+Error|Exception):/g;
  let match;
  while ((match = exceptionRegex.exec(stderr)) !== null) {
    if (!patterns.includes(match[1])) {
      patterns.push(match[1]);
    }
  }

  // Look for "fatal:" or "error:" standard CLI outputs
  const standardErrorRegex = /(?:fatal|error):\s*(.+)$/im;
  const stdMatch = standardErrorRegex.exec(stderr);
  if (stdMatch && stdMatch[1]) {
    patterns.push(stdMatch[1].trim());
  }

  // Look for Node.js-specific error codes: ERR_MODULE_NOT_FOUND, MODULE_NOT_FOUND, EACCES, EPERM, etc.
  const errCodeRegex = /\b((?:ERR_)?[A-Z][A-Z0-9_]{3,})\b/g;
  while ((match = errCodeRegex.exec(stderr)) !== null) {
    const code = match[1];
    // Skip common noise words that match the pattern but aren't error codes
    if (['REQUIRED', 'NODE', 'PATH', 'FILE', 'HOME', 'USER', 'CRASH', 'REPORT',
         'END', 'APPLICATION', 'VERSION', 'PROCESS', 'PLATFORM',
         'PID', 'STACK', 'TRACE', 'UNHANDLED'].includes(code)) continue;
    if (!patterns.includes(code)) {
      patterns.push(code);
    }
  }

  return patterns;
}
