/**
 * Security validation utilities for BugProof.
 * Prevents path traversal, command injection, git ref injection,
 * and environment variable hijacking from untrusted artifact data.
 */

import * as path from 'path';

/**
 * Validates that a resolved file path stays within the expected boundary directory.
 * Prevents path traversal attacks via `../` sequences.
 */
export function isPathWithinBoundary(filePath: string, boundaryDir: string): boolean {
  const resolved = path.resolve(filePath);
  const boundary = path.resolve(boundaryDir);
  return resolved.startsWith(boundary + path.sep) || resolved === boundary;
}

/**
 * Validates a git ref string to prevent flag injection.
 * Git interprets arguments starting with `-` as flags, so we reject those.
 * Accepts: hex commit SHAs, branch names (alphanumeric, dots, slashes, dashes, underscores).
 */
export function isValidGitRef(ref: string): boolean {
  if (!ref || ref.length === 0 || ref.length > 256) return false;
  // Must not start with a dash (flag injection)
  if (ref.startsWith('-')) return false;
  // Allow hex SHAs or branch-like names
  // Valid chars: a-z, A-Z, 0-9, /, ., _, -
  return /^[a-zA-Z0-9._/-]+$/.test(ref);
}

/**
 * Environment variable names that must NEVER be overridden from untrusted artifact data.
 * These can be used to hijack process execution.
 */
export const DANGEROUS_ENV_VARS = new Set([
  'PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'NODE_OPTIONS',
  'NODE_PATH',
  'HOME',
  'USERPROFILE',
  'SHELL',
  'COMSPEC',
  'SYSTEMROOT',
  'WINDIR',
  'PYTHONPATH',
  'RUBYLIB',
  'PERL5LIB',
  'TEMP',
  'TMP',
  'TMPDIR',
  'APPDATA',
  'LOCALAPPDATA',
  'XDG_RUNTIME_DIR',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'CURL_CA_BUNDLE',
]);

/**
 * Filters an environment record, removing keys that could hijack execution.
 * Used during replay to prevent artifact environment from overriding critical host vars.
 */
export function sanitizeArtifactEnvironment(
  artifactEnv: Record<string, string>,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, val] of Object.entries(artifactEnv)) {
    if (!DANGEROUS_ENV_VARS.has(key.toUpperCase())) {
      safe[key] = val;
    }
  }
  return safe;
}
