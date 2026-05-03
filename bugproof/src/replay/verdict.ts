import { ReplayResult } from './engine';

export type VerdictStatus = 'confirmed' | 'not_confirmed' | 'blocked_by_env';

export interface Verdict {
  status: VerdictStatus;
  message: string;
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

  // 2. Fuzzy Pattern Match
  // Check if actual failure shares any of the same error patterns
  const sharedPatterns = actualFailure.error_patterns.filter(p => 
    expectedFailure.error_patterns.includes(p)
  );

  if (sharedPatterns.length > 0) {
    return {
      status: 'confirmed',
      message: `Reproduction confirmed (fuzzy match on patterns: ${sharedPatterns.join(', ')})`
    };
  }

  // 3. Different exit code, but failed
  if (actualFailure.exit_code !== 0) {
    return {
      status: 'not_confirmed',
      message: `Failed, but with a different error. Expected pattern: ${expectedFailure.error_patterns[0] || 'Unknown'} / Actual pattern: ${actualFailure.error_patterns[0] || 'Unknown'}`
    };
  }

  // 4. Succeeded
  return {
    status: 'not_confirmed',
    message: 'Command succeeded on replay. The bug did not reproduce.'
  };
}
