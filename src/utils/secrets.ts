export const SECRET_PATTERNS = [
  /api_?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /bearer/i,
  /aws_secret_access_key/i,
  /github_token/i,
  /stripe_sk_/i,
  /^[A-Z0-9]{20,128}$/ // Likely tokens (bounded to prevent excessive matching)
];

/**
 * Compute Shannon entropy of a string (bits per character).
 *
 * High-entropy strings (≥ 4.5 bits/char) with sufficient length are
 * characteristic of randomly-generated secrets (API keys, JWT tokens,
 * random passwords). Normal English text sits around 3.5-4.0 bits/char.
 *
 * Reference: https://en.wikipedia.org/wiki/Entropy_(information_theory)
 */
export function shannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const freq: Map<string, number> = new Map();
  for (const ch of str) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Heuristic thresholds for entropy-based secret detection.
 *
 * A value must meet ALL of the following to be flagged:
 *   - Length ≥ MIN_ENTROPY_LENGTH (short values produce false positives)
 *   - Shannon entropy ≥ ENTROPY_THRESHOLD
 *   - Composed predominantly of alphanumeric / token-safe characters
 *     (rules out human-readable sentences that happen to be long)
 */
const MIN_ENTROPY_LENGTH = 20;
const ENTROPY_THRESHOLD = 4.5;
// Fraction of "token-like" chars (alphanum + safe base64/hex symbols) required
const TOKEN_CHAR_RATIO = 0.85;

export function looksLikeSecret(value: string): boolean {
  if (!value || value.length < MIN_ENTROPY_LENGTH) return false;
  // Must be predominantly token-like characters
  const tokenChars = [...value].filter(ch => /[a-zA-Z0-9+/=._\-~]/.test(ch)).length;
  if (tokenChars / value.length < TOKEN_CHAR_RATIO) return false;
  // Must not be a plain filesystem path or URL
  if (value.startsWith('/') || value.startsWith('\\') || value.includes('://')) return false;
  // Apply entropy gate
  return shannonEntropy(value) >= ENTROPY_THRESHOLD;
}

export interface SecretScanResult {
  hasSecrets: boolean;
  detectedKeys: string[];
}

export function scanEnvironmentForSecrets(env: NodeJS.ProcessEnv): SecretScanResult {
  const detectedKeys: string[] = [];
  
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    
    // 1. Pattern-match on the key name (known secret key names)
    let isSecret = false;
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(key) || (pattern.test(value) && value.length > 15)) {
        isSecret = true;
        break;
      }
    }

    // 2. Entropy-based detection: catch unknown high-entropy secret values
    //    even when the key name is innocuous (e.g. MY_APP_CREDENTIAL=<jwt>).
    if (!isSecret) {
      isSecret = looksLikeSecret(value);
    }
    
    if (isSecret) {
      detectedKeys.push(key);
    }
  }
  
  return {
    hasSecrets: detectedKeys.length > 0,
    detectedKeys
  };
}

export function buildEnvironmentSchema(env: NodeJS.ProcessEnv, detectedSecrets: string[]): { required: string[], optional: string[], secrets: string[], captured_env_keys: string[] } {
  // In a real scenario, we'd determine which env vars are actually required by the app.
  // For v0.1, we classify everything non-standard as 'optional' unless explicitly mapped,
  // except secrets which are separated out.
  const standardKeys = ['PATH', 'HOME', 'USER', 'SHELL', 'TEMP', 'TMPDIR', 'USERPROFILE'];
  
  const optional: string[] = [];
  const required: string[] = []; // We will let users specify required later, or infer
  const secrets = [...detectedSecrets];
  const captured_env_keys = Object.keys(env);
  
  for (const key of Object.keys(env)) {
    if (standardKeys.includes(key)) continue;
    if (secrets.includes(key)) continue;
    optional.push(key);
  }
  
  return { required, optional, secrets, captured_env_keys };
}

const PII_PATTERNS = [
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
  { regex: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, replacement: '[REDACTED_IP]' },
  { regex: /\b(sk_live|sk_test|pk_live|pk_test)_[0-9a-zA-Z]{20,}\b/g, replacement: '[REDACTED_STRIPE_KEY]' },
  { regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}\b/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[REDACTED_CREDIT_CARD]' }
];

export function sanitizePII(text: string): string {
  if (!text) return text;
  let sanitized = text;
  for (const { regex, replacement } of PII_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement);
  }
  return sanitized;
}

