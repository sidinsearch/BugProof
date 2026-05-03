export const SECRET_PATTERNS = [
  /api_?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /bearer/i,
  /aws_secret_access_key/i,
  /github_token/i,
  /stripe_sk_/i,
  /^[A-Z0-9]{20,}$/ // Likely tokens
];

export interface SecretScanResult {
  hasSecrets: boolean;
  detectedKeys: string[];
}

export function scanEnvironmentForSecrets(env: NodeJS.ProcessEnv): SecretScanResult {
  const detectedKeys: string[] = [];
  
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    
    // Check if key matches known secret patterns
    let isSecret = false;
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(key) || (pattern.test(value) && value.length > 15)) {
        isSecret = true;
        break;
      }
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

export function buildEnvironmentSchema(env: NodeJS.ProcessEnv, detectedSecrets: string[]): { required: string[], optional: string[], secrets: string[] } {
  // In a real scenario, we'd determine which env vars are actually required by the app.
  // For v0.1, we classify everything non-standard as 'optional' unless explicitly mapped,
  // except secrets which are separated out.
  const standardKeys = ['PATH', 'HOME', 'USER', 'SHELL', 'TEMP', 'TMPDIR', 'USERPROFILE'];
  
  const optional: string[] = [];
  const required: string[] = []; // We will let users specify required later, or infer
  const secrets = [...detectedSecrets];
  
  for (const key of Object.keys(env)) {
    if (standardKeys.includes(key)) continue;
    if (secrets.includes(key)) continue;
    optional.push(key);
  }
  
  return { required, optional, secrets };
}
