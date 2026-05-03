import * as crypto from 'crypto';

/**
 * Generates a SHA-256 fingerprint from stderr/stdout output.
 * This provides the exact match hash for deterministic failures.
 */
export function generateExactFingerprint(stderr: string): string {
  const hash = crypto.createHash('sha256');
  // Normalize line endings to \n to ensure hashes match across OS
  const normalized = stderr.replace(/\r\n/g, '\n').trim();
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

  return patterns;
}
