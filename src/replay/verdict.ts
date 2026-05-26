import { ReplayResult } from './engine.js';

export type VerdictStatus = 'confirmed' | 'not_confirmed' | 'blocked_by_env';

export interface Verdict {
  status: VerdictStatus;
  message: string;
}

/**
 * Normalize error patterns for cross-platform comparison.
 * Only normalizes platform-specific differences (paths, line endings),
 * preserves exception names and error codes for accurate matching.
 */
function normalizeForCrossPlatform(pattern: string): string {
  return pattern
    // Normalize Windows paths to Unix-style (D:\path → /path)
    .replace(/([A-Za-z]):\\/g, '$1/')
    .replace(/\\\\/g, '/')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .trim();
}

function normalizePatterns(patterns: string[]): string[] {
  return [...new Set(patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0))].sort();
}

// Recognize core failure tokens: exception names and structured error codes.
function isCorePattern(pattern: string): boolean {
  return /^(?:[A-Z][a-zA-Z0-9]+(?:Error|Exception)|ERR_[A-Z0-9_]+|E[A-Z0-9_]{3,})$/.test(pattern);
}

function isCodeLikePattern(pattern: string): boolean {
  return /^(?:ERR_[A-Z0-9_]+|E[A-Z0-9_]{3,})$/.test(pattern);
}

function normalizeMessagePattern(pattern: string): string {
  return pattern.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Matching strategy:
// - Core tokens (exception names and real error codes) must line up.
// - Extra code-like tokens can be tolerated when the same bug still reproduces.
// - Freeform message fragments only confirm when there are no core tokens at all.
function hasMatchingSignificantPatterns(expectedPatterns: string[], actualPatterns: string[]): boolean {
  const expectedNormalized = normalizePatterns(expectedPatterns);
  const actualNormalized = normalizePatterns(actualPatterns);
  const expectedCore = expectedNormalized.filter(isCorePattern);
  const actualCore = actualNormalized.filter(isCorePattern);

  if (expectedCore.length > 0) {
    if (!expectedCore.every((pattern) => actualCore.includes(pattern))) {
      return false;
    }

    const extraCorePatterns = actualCore.filter((pattern) => !expectedCore.includes(pattern));
    return extraCorePatterns.every(isCodeLikePattern);
  }

  if (actualCore.length > 0) {
    return false;
  }

  const expectedMessages = expectedNormalized.map(normalizeMessagePattern);
  const actualMessages = actualNormalized.map(normalizeMessagePattern);

  return expectedMessages.some((pattern) => actualMessages.includes(pattern));
}

export function generateVerdict(result: ReplayResult): Verdict {
  const { expectedFailure, actualFailure } = result;

  // 1. Exact Fingerprint Match
  if (expectedFailure.fingerprint === actualFailure.fingerprint) {
    return {
      status: 'confirmed',
      message: 'Reproduction confirmed (exact fingerprint match)'
    };
  }

  // 2. Normalized Pattern Match (with cross-platform normalization)
  const expectedPatterns = normalizePatterns(expectedFailure.error_patterns);
  const actualPatterns = normalizePatterns(actualFailure.error_patterns);

  // Try direct pattern match first
  if (hasMatchingSignificantPatterns(expectedPatterns, actualPatterns)) {
    return {
      status: 'confirmed',
      message: `Reproduction confirmed (normalized pattern match: ${expectedPatterns.filter(isCorePattern).join(', ') || expectedPatterns.join(', ')})`
    };
  }

  // 3. Cross-platform normalized pattern match
  // Normalize both sides for path/format differences
  const expectedNormalized = expectedPatterns.map(normalizeForCrossPlatform);
  const actualNormalized = actualPatterns.map(normalizeForCrossPlatform);

  if (hasMatchingSignificantPatterns(expectedNormalized, actualNormalized)) {
    return {
      status: 'confirmed',
      message: 'Reproduction confirmed (cross-platform pattern match)'
    };
  }

  // 4. Different exit code, but failed
  if (actualFailure.exit_code !== 0) {
    return {
      status: 'not_confirmed',
      message: `Failed, but with a different error. Expected pattern: ${expectedFailure.error_patterns[0] || 'Unknown'} / Actual pattern: ${actualFailure.error_patterns[0] || 'Unknown'}`
    };
  }

  // 5. Succeeded
  return {
    status: 'not_confirmed',
    message: 'Command succeeded on replay. The bug did not reproduce.'
  };
}
