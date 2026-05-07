# BugProof Security Audit Report

**Date:** 2026-05-08  
**Auditor:** GitHub Copilot (Security Reviewer Mode)  
**Project:** BugProof v0.2.2 - Executable Bug Artifacts CLI  
**Scope:** Command execution, artifact deserialization, sandbox isolation, supply chain

---

## Executive Summary

BugProof is a CLI tool that captures executable bug artifacts and replays them in isolated sandboxes. The tool handles untrusted artifact data, executes arbitrary commands, manages GitHub credentials, and operates across Windows/Linux/macOS platforms. This audit identified **2 CRITICAL**, **4 HIGH**, and **5 MEDIUM** security issues that require remediation before npm publication.

**Risk Level: HIGH** — The tool's core functionality involves executing arbitrary commands from untrusted artifacts, requiring robust isolation and input validation.

---

## CRITICAL Vulnerabilities

### 1. **Path Traversal in Archive Extraction (extract-zip)**

**Severity:** CRITICAL  
**Location:** `src/replay/sandbox.ts` L105, `src/utils/archive.ts` L24  
**CVSS:** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N)

**Issue:**
The `extract-zip` library (v2.0.1) does not validate extracted file paths against traversal attacks. An attacker can craft a malicious .bug ZIP archive with entries like `../../etc/passwd` or `../../../system32/win.ini` to escape the extraction directory and overwrite system files or plant malicious code.

**Proof of Concept:**
```bash
# Create a malicious artifact with path traversal
echo '{"name":"pwned"}' > exploit.json
# ZIP with traversal path: ../../../var/tmp/backdoor.js
# When extracted, lands outside bugbox sandbox
```

**Attack Chain:**
1. Attacker creates .bug artifact with path traversal payloads
2. User replays with `bugproof replay malicious.bug`
3. Archive extracts to `../../sensitive/location`
4. Replayed command or subsequent operations access compromised files

**Fix:**
```typescript
// src/utils/archive.ts - add validation after extraction
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  // Extract to temp directory first
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-validate-'));
  try {
    await extract(zipPath, { dir: tempDir });
    
    // Validate all paths stay within boundary
    const entries = fs.readdirSync(tempDir, { recursive: true });
    for (const entry of entries) {
      const fullPath = path.resolve(path.join(tempDir, entry));
      if (!isPathWithinBoundary(fullPath, tempDir)) {
        throw new Error(`Path traversal detected in archive: ${entry}`);
      }
    }
    
    // Safe to copy to destination
    fs.cpSync(tempDir, destDir, { recursive: true });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
```

---

### 2. **Untrusted Artifact Deserialization Without Schema Validation**

**Severity:** CRITICAL  
**Location:** `src/cli.ts` L321-323  
**CVSS:** 8.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)

**Issue:**
User-controlled JSON files from artifacts are parsed with `JSON.parse()` without any schema validation, type coercion, or sanitization. A malicious artifact can inject arbitrary JavaScript-like structures that, while safe in JSON, could enable:
- Object prototype pollution attacks if later merged/extended
- Command array manipulation leading to RCE
- Environment variable poisoning through large/nested objects
- Memory exhaustion via deeply nested structures
- Type confusion attacks if code assumes specific types

**Vulnerable Code:**
```typescript
// src/cli.ts L321-323
const manifestRaw = fs.readFileSync(path.join(targetPath, 'manifest.json'), 'utf-8');
manifest = JSON.parse(manifestRaw);  // ← No validation
runConfig = JSON.parse(fs.readFileSync(path.join(targetPath, 'run.json'), 'utf-8'));  // ← No validation
expectedFailure = JSON.parse(fs.readFileSync(path.join(targetPath, 'failure.json'), 'utf-8'));  // ← No validation
```

**Attack Scenarios:**

**Scenario A: Object Prototype Pollution**
```json
{
  "command": ["node", "index.js"],
  "__proto__": { "isAdmin": true },
  "constructor": { "prototype": { "execAs": "SYSTEM" } }
}
```

**Scenario B: Command Injection via Array**
```json
{
  "command": ["; rm -rf /", "node"],
  "working_directory": "/"
}
```

**Scenario C: Environment Poisoning**
```json
{
  "environment": {
    "NODE_OPTIONS": "--experimental-loader malicious.js",
    "PATH": "/tmp/trojan:$PATH"
  }
}
```

**Fix:**
Implement strict schema validation using a library like `zod` or `joi`:

```typescript
// src/types/schemas.ts
import { z } from 'zod';

export const RunConfigSchema = z.object({
  command: z.array(z.string().max(1024)).min(1).max(100),
  working_directory: z.string().max(1024),
  environment: z.record(z.string(), z.string().max(10000)).default({}),
  timeout_ms: z.number().min(1000).max(3600000),
  capture_output: z.boolean().default(true),
});

export const ArtifactManifestSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  bugproof_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().max(256).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().max(2048),
  command: z.array(z.string()).min(1),
  exit_code: z.number().int().min(-128).max(255),
  // ... other fields
});

// src/cli.ts - updated replay command
try {
  const manifestRaw = fs.readFileSync(path.join(targetPath, 'manifest.json'), 'utf-8');
  manifest = ArtifactManifestSchema.parse(JSON.parse(manifestRaw));
  
  runConfig = RunConfigSchema.parse(
    JSON.parse(fs.readFileSync(path.join(targetPath, 'run.json'), 'utf-8'))
  );
  
  expectedFailure = FailureRecordSchema.parse(
    JSON.parse(fs.readFileSync(path.join(targetPath, 'failure.json'), 'utf-8'))
  );
} catch (validationErr) {
  throw new Error(`Artifact validation failed: ${validationErr.message}`);
}
```

---

## HIGH Priority Issues

### 3. **GitHub Token Exposure in Error Messages and Logs**

**Severity:** HIGH  
**Location:** `src/share/gist.ts` L41, L153-157  
**CVSS:** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

**Issue:**
The GitHub authentication token is used directly in HTTP headers and error messages. If an error occurs (network failure, rate limiting, invalid gist response), the full error object from the API might contain debug information that could leak the token in:
- Stack traces printed to stderr
- Error logs written to disk
- Terminal output captured in CI/CD logs
- Process memory dumps

**Vulnerable Code:**
```typescript
// src/share/gist.ts L153-157
const req = https.request(options, (res) => {
  // ...
  res.on('end', () => {
    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
      resolve(body);
    } else {
      reject(new Error(`GitHub API error ${res.statusCode}: ${body}`));  // ← Could leak token in response
    }
  });
});

req.on('error', reject);  // ← Could leak full error with headers
```

**Attack Scenarios:**
1. Network error during Gist creation → stack trace printed to console
2. Rate limit response → error message logged with debug info
3. Process crashes → core dump contains token in memory
4. CI/CD platform captures stderr → token exposed in logs

**Fix:**
```typescript
// src/share/gist.ts - sanitize errors
function sanitizeError(err: any, token: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Remove token from error message
  return msg.replace(new RegExp(token, 'g'), '<REDACTED>');
}

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
      resolve(body);
    } else {
      // Don't include full body in error, which may contain debug info
      const statusOnly = `GitHub API error ${res.statusCode}`;
      reject(new Error(statusOnly));
    }
  });
});

req.on('error', (err) => {
  // Log without token
  reject(new Error(`Network error during Gist upload: ${sanitizeError(err, token)}`));
});
```

Also add a check at the CLI level:

```typescript
// src/cli.ts - wrap shareToGist call
try {
  const result = await shareToGist(artifactPath, { description });
  info(`Artifact shared: ${result.url}`);
} catch (err) {
  const token = process.env.GITHUB_TOKEN || process.env.BUGPROOF_GITHUB_TOKEN || '';
  const sanitized = String(err).replace(new RegExp(token, 'g'), '<REDACTED>');
  error(`Failed to share: ${sanitized}`);
  process.exit(1);
}
```

---

### 4. **Firewall Rule Name Injection on Windows**

**Severity:** HIGH  
**Location:** `src/sandbox/network.ts` L132, `src/sandbox/bugbox.ts` L89  
**CVSS:** 6.8 (AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:H/A:L)

**Issue:**
The `ruleName` passed to `netsh` is constructed from a timestamp (`bugbox-net-${Date.now()}`) but is not validated or escaped. If a race condition allows an attacker to control the timing or process name, or if there's a time-based collision, commands could be injected into the `netsh` invocation.

**Vulnerable Code:**
```typescript
// src/sandbox/bugbox.ts L89
const ruleName = `bugbox-net-${Date.now()}`;
// ...
if (netResult.needsPreExec) {
  const exePath = netResult.command[0];
  addFirewallBlockRule(ruleName, exePath);  // ← exePath not validated
}

// src/sandbox/network.ts L132
export function addFirewallBlockRule(ruleName: string, exePath: string): boolean {
  try {
    const result = spawnSync(
      'netsh',
      [
        'advfirewall', 'firewall', 'add', 'rule',
        `name=${ruleName}`,  // ← Could be injected if ruleName contains special chars
        'dir=out',
        'action=block',
        `program=${exePath}`,  // ← exePath not validated, could contain spaces/quotes
      ],
      // ...
    );
```

**Attack Scenarios:**
1. If `exePath` contains newlines or special characters, could inject additional `netsh` commands
2. If `ruleName` collision occurs, could block wrong process or cause rule name conflicts
3. Windows command escaping issues with spaces in paths

**Fix:**
```typescript
// src/sandbox/network.ts - validate and escape
export function addFirewallBlockRule(ruleName: string, exePath: string): boolean {
  // Validate ruleName format (alphanumeric + dash/underscore only)
  if (!/^[a-z0-9_-]+$/.test(ruleName)) {
    throw new Error(`Invalid firewall rule name: ${ruleName}`);
  }

  // Validate exePath exists and is a file
  if (!fs.existsSync(exePath) || !fs.statSync(exePath).isFile()) {
    throw new Error(`Invalid executable path: ${exePath}`);
  }

  // Use absolute path to prevent relative path attacks
  const absolutePath = path.resolve(exePath);

  try {
    const result = spawnSync(
      'netsh',
      [
        'advfirewall', 'firewall', 'add', 'rule',
        `name=${ruleName}`,
        'dir=out',
        'action=block',
        `program="${absolutePath}"`,  // Quote the path
        'enable=yes',
      ],
      { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}
```

Also use a cryptographically secure random rule name:

```typescript
// src/sandbox/bugbox.ts - use crypto.randomBytes for rule name
import { randomBytes } from 'crypto';

const ruleName = `bugbox-net-${randomBytes(8).toString('hex')}`;
```

---

### 5. **Incomplete Sandbox Isolation - Windows Job Objects**

**Severity:** HIGH  
**Location:** `src/sandbox/resources.ts` L50-65  
**CVSS:** 6.2 (AV:L/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:L)

**Issue:**
The tool advertises "full" sandbox isolation on Windows using Job Objects, but Job Objects do NOT provide true process isolation like namespaces on Linux. They only enforce resource limits (memory, CPU). An attacker's code running in a Job Object can:

- Access the host filesystem (no filesystem isolation)
- Create network connections (no network isolation attempted on Windows beyond firewall rules)
- Access host environment variables
- Interact with host processes via IPC/shared memory
- See all processes via `Get-Process` in PowerShell

**Current Implementation Gap:**
```typescript
// src/sandbox/resources.ts L50-65
// "Job Object" strategy creates a PowerShell wrapper that doesn't actually create a Job Object
// The code just starts a process, it doesn't use the Win32 Job Object API

const psWrapper = [
  '$ErrorActionPreference = "Stop"',
  limitClauses,
  // This doesn't actually create a Job Object boundary
  `$proc = Start-Process -NoNewWindow -Wait -PassThru -FilePath "${command[0].replace(/"/g, '`"')}"`,
  'exit $proc.ExitCode',
].filter(Boolean).join('; ');

// This is NOT true isolation
return ['powershell', '-NoProfile', '-Command', psWrapper];
```

**Attack Scenarios:**
1. Replayed command escapes via `CreateRemoteThread` injection
2. Environment variable access leaks secrets
3. Network connections bypass firewall rules (rules only block outbound, not inbound from internal addresses)
4. DLL injection attacks from shared directories

**Fix:**
**Option A:** Update documentation to clarify Windows limitations:
```typescript
// src/sandbox/capabilities.ts - document limitations
export function detectCapabilities(): PlatformCapabilities {
  return {
    // ...
    hasJobObjects: false,  // Change to false - don't claim Job Object isolation
    // ...
  };
}

// src/sandbox/resources.ts - clarify in comments
/**
 * Windows: Job Objects on Windows do NOT provide true process isolation.
 * They only enforce resource limits (memory, CPU, handles).
 * They do NOT provide:
 * - Filesystem isolation
 * - Network isolation
 * - Registry isolation
 * - Process isolation (can still spawn and interact with host processes)
 * 
 * For true isolation on Windows, containerization (Docker) is required.
 */
```

**Option B:** Implement actual Job Object API via Node FFI:
```typescript
// Would require native module or FFI binding
// This is complex and out of scope for v0.2
// Recommend deferring to v0.3 and documenting limitation
```

**Recommendation:** For npm publication, document that:
- Linux: "full" sandbox works (unshare PID namespaces)
- macOS: sandbox-exec provides strong isolation
- Windows: only "workspace" mode is safe; "isolated"/"full" are best-effort only

---

### 6. **Insecure Windows Registry Modification in postinstall.cjs**

**Severity:** HIGH  
**Location:** `scripts/postinstall.cjs` L58-69  
**CVSS:** 7.1 (AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N)

**Issue:**
The postinstall script uses `reg.exe` to register .bug file associations with command paths. The `cliPath` is not properly escaped, and the `%1` placeholder is not quoted, creating vulnerabilities:

1. If CLI path contains spaces and isn't quoted, `reg.exe` could misinterpret it
2. If registry value is read by a program that doesn't quote it, file paths with spaces break
3. No verification that the registry write succeeds or has expected permissions

**Vulnerable Code:**
```javascript
// scripts/postinstall.cjs L58-62
const openCommand = `\"${process.execPath}\" \"${cliPath}\" replay \"%1\"`;
// If cliPath has quotes in it, this breaks badly

outcomes.push(reg([
  'add',
  'HKCU\\Software\\Classes\\BugProof.Artifact\\shell\\open\\command',
  '/ve',
  '/d',
  openCommand,  // ← Not escaped for reg.exe
  '/f',
]));
```

**Attack Scenarios:**
1. Path with quote character: `C:\Program Files\...\"...` → registry entry breaks
2. Path with special characters: `C:\path\with\$special` → might be interpreted by shell
3. Malicious registry value could execute arbitrary commands when opening .bug file

**Fix:**
```javascript
// scripts/postinstall.cjs - proper escaping
function escapeRegValue(value) {
  // Escape quotes and backslashes for reg.exe
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '%%');  // Double % in reg.exe context
}

function registerWindowsAssociation() {
  const reg = (args) => runCommand('reg', args, 5000);

  // Ensure paths are properly quoted
  const execPath = process.execPath;
  const cliBinaryPath = cliPath;

  if (!/^"/.test(execPath)) {
    log(`ERROR: Node executable path not properly quoted: ${execPath}`);
    return;
  }

  const openCommand = `${execPath} "${cliBinaryPath}" replay "%%1"`;
  const escapedCommand = escapeRegValue(openCommand);

  const outcomes = [];

  outcomes.push(reg([
    'add',
    'HKCU\\Software\\Classes\\.bug',
    '/ve',
    '/d',
    'BugProof.Artifact',
    '/f',
  ]));

  outcomes.push(reg([
    'add',
    'HKCU\\Software\\Classes\\BugProof.Artifact\\shell\\open\\command',
    '/ve',
    '/d',
    escapedCommand,  // ← Properly escaped
    '/f',
  ]));

  const failed = outcomes.some((result) => result.status !== 0);
  if (failed) {
    log('ERROR: Windows .bug association setup failed.');
    log('Verify that the registry is not corrupted.');
  } else {
    log('Windows .bug file association registered (HKCU).');
  }
}
```

---

## MEDIUM Priority Issues

### 7. **Incomplete Secret Pattern Detection**

**Severity:** MEDIUM  
**Location:** `src/utils/secrets.ts` L1-8  
**CVSS:** 5.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)

**Issue:**
The `SECRET_PATTERNS` regex array is incomplete and may miss many secret formats:
- AWS keys (format: `AKIA*` or `ASIA*`)
- Slack tokens (format: `xox*`)
- Stripe API keys (hardcoded prefix check is incomplete)
- Private keys (RSA, DSA, EC key headers)
- Database connection strings
- API keys for other services

Current regex `^[A-Z0-9]{20,128}$` is too broad and will have false positives on legitimate config values.

**Current Code:**
```typescript
export const SECRET_PATTERNS = [
  /api_?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /bearer/i,
  /aws_secret_access_key/i,
  /github_token/i,
  /stripe_sk_/i,
  /^[A-Z0-9]{20,128}$/  // ← Too broad, too many false positives
];
```

**Fix:**
```typescript
export const SECRET_PATTERNS = [
  // Variable name patterns
  /api_?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /bearer/i,
  /credential/i,
  /auth/i,
  /private_key/i,
  
  // Service-specific patterns
  /aws_secret_access_key/i,
  /github_token/i,
  /stripe_(?:sk|rk)_/i,  // Stripe secret/restricted keys
  /slack_token/i,
  /slack_webhook/i,
  /twilio_auth/i,
  /sendgrid_api_key/i,
  
  // Key material patterns
  /-----BEGIN RSA PRIVATE KEY-----/,
  /-----BEGIN OPENSSH PRIVATE KEY-----/,
  /-----BEGIN EC PRIVATE KEY-----/,
  /-----BEGIN CERTIFICATE-----/,
  
  // AWS key IDs and secrets
  /^AKIA[0-9A-Z]{16}$/,  // AWS access key ID
  /^ASIA[0-9A-Z]{16}$/,  // AWS temporary access key ID
  
  // Database connection strings
  /^(mongodb|postgresql|mysql|redis):\/\//,
  
  // High-entropy strings in specific variable names (with context)
  // This should only trigger if variable name indicates it's secret
];

export interface SecretScanResult {
  hasSecrets: boolean;
  detectedKeys: string[];
  detectionMethod: ('key_pattern' | 'entropy_pattern' | 'format_pattern')[];
}

export function scanEnvironmentForSecrets(env: NodeJS.ProcessEnv): SecretScanResult {
  const detectedKeys: string[] = [];
  const detectionMethods: ('key_pattern' | 'entropy_pattern' | 'format_pattern')[] = [];
  
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    
    let isSecret = false;
    let method: 'key_pattern' | 'entropy_pattern' | 'format_pattern' = 'key_pattern';
    
    // Check key name patterns (highest confidence)
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(key)) {
        isSecret = true;
        break;
      }
    }
    
    // Check value format patterns
    if (!isSecret) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(value) && value.length > 10) {
          isSecret = true;
          method = 'format_pattern';
          break;
        }
      }
    }
    
    // High-entropy check (Shannon entropy) for base64/hex strings
    if (!isSecret && /^(secret|token|key|pass|credential)/.test(key.toLowerCase())) {
      if (isHighEntropy(value)) {
        isSecret = true;
        method = 'entropy_pattern';
      }
    }
    
    if (isSecret) {
      detectedKeys.push(key);
      if (!detectionMethods.includes(method)) {
        detectionMethods.push(method);
      }
    }
  }
  
  return {
    hasSecrets: detectedKeys.length > 0,
    detectedKeys,
    detectionMethod: detectionMethods
  };
}

function isHighEntropy(str: string): boolean {
  if (str.length < 16) return false;
  
  // Check if it's mostly uppercase hex or base64 (indicative of random data)
  const entropy = calculateEntropy(str);
  // Base64 alphabet has ~64 chars, hex has 16. Normal text has ~26.
  // Secrets typically have entropy > 4.0
  return entropy > 4.0 && (str.length > 20 || /^[A-Za-z0-9+/=]+$/.test(str));
}

function calculateEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
```

---

### 8. **No Validation of Replayed Command Before Execution**

**Severity:** MEDIUM  
**Location:** `src/replay/engine.ts` L69-72, `src/capture/engine.ts` L29  
**CVSS:** 5.4 (AV:N/AC:L/PR:L/UI:R/S:U/C:L/I:L/A:N)

**Issue:**
The command array from the artifact is used directly without checking for:
1. Dangerous shell built-ins or characters when shell=false
2. Path traversal in the executable name
3. Absolute vs. relative path disclosure
4. Excessively long command arrays (resource exhaustion)

**Vulnerable Code:**
```typescript
// src/capture/engine.ts L29
const command = resolveExecutable(config.command[0]);
const args = config.command.slice(1);

// ... later

proc = spawn(command, args, {
  cwd: config.working_directory,
  env: config.environment,
  shell: false  // ← Good: shell=false prevents shell injection
});
```

While `shell: false` is good, there's still no validation that the command is reasonable.

**Fix:**
```typescript
// src/utils/command-validator.ts
export interface CommandValidationResult {
  valid: boolean;
  reason?: string;
  warnings: string[];
}

export function validateCommand(command: string[]): CommandValidationResult {
  const warnings: string[] = [];

  if (!command || command.length === 0) {
    return { valid: false, reason: 'Command array is empty' };
  }

  if (command.length > 256) {
    return { valid: false, reason: `Command array too large (${command.length} > 256)` };
  }

  const executable = command[0];

  // Check for path traversal
  if (executable.includes('..')) {
    return { valid: false, reason: `Command contains path traversal: ${executable}` };
  }

  // Warn if using relative paths (not inherently bad, but worth noting)
  if (!path.isAbsolute(executable) && !executable.includes('/') && !executable.includes('\\')) {
    warnings.push(`Command uses unqualified executable name: ${executable} (resolved from PATH)`);
  }

  // Check string lengths
  for (let i = 0; i < command.length; i++) {
    const arg = command[i];
    if (typeof arg !== 'string') {
      return { valid: false, reason: `Argument ${i} is not a string: ${typeof arg}` };
    }
    if (arg.length > 8192) {
      return { valid: false, reason: `Argument ${i} too large (${arg.length} > 8192)` };
    }
  }

  // Warn if executable name matches dangerous patterns
  const dangerousPatterns = /^(eval|exec|system|create_process|fork)/i;
  if (dangerousPatterns.test(executable)) {
    warnings.push(`Executable name matches potentially dangerous pattern: ${executable}`);
  }

  return { valid: true, warnings };
}

// src/capture/engine.ts - use validation
export async function executeAndCapture(config: RunConfig): Promise<{ failure: FailureRecord, stdout: string, stderr: string }> {
  // Validate the command
  const validation = validateCommand(config.command);
  if (!validation.valid) {
    throw new Error(`Invalid command: ${validation.reason}`);
  }
  if (validation.warnings.length > 0) {
    console.warn('Command validation warnings:', validation.warnings);
  }

  // ... rest of function
}
```

---

### 9. **Zip Bomb / Decompression Attack - No Size Limits on Extract**

**Severity:** MEDIUM  
**Location:** `src/utils/archive.ts` L24, `src/cli.ts` L308  
**CVSS:** 6.5 (AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:N/A:H)

**Issue:**
When extracting a .bug artifact ZIP, there's no validation of:
1. Compressed size vs. uncompressed size ratio (zip bombs have ratios > 100000:1)
2. Individual file sizes (nested zips can explode to terabytes)
3. Number of files in the archive
4. Extraction doesn't terminate early if disk space fills up

**Attack Scenario:**
```bash
# Create a zip bomb: 40GB of zeros compressed to 40MB
dd if=/dev/zero bs=1M count=40000 | gzip | zip bomb.zip -
# User tries to extract: `bugproof replay bomb.bug`
# Disk fills up, system becomes unstable
```

**Fix:**
```typescript
// src/utils/archive.ts - add size validation
export interface ExtractOptions {
  maxTotalSize?: number;        // Default: 500MB
  maxFileSize?: number;         // Default: 100MB
  maxFileCount?: number;        // Default: 10,000
  maxCompressionRatio?: number; // Default: 100:1
}

export async function extractZip(
  zipPath: string,
  destDir: string,
  options: ExtractOptions = {}
): Promise<void> {
  const {
    maxTotalSize = 500 * 1024 * 1024,      // 500MB
    maxFileSize = 100 * 1024 * 1024,       // 100MB
    maxFileCount = 10000,
    maxCompressionRatio = 100
  } = options;

  try {
    const zipStat = fs.statSync(zipPath);
    const compressedSize = zipStat.size;

    // Pre-flight: read zip central directory to check sizes
    const zipInfo = await analyzeZipFile(zipPath);
    
    if (zipInfo.uncompressedSize > maxTotalSize) {
      throw new Error(
        `Archive uncompressed size (${(zipInfo.uncompressedSize / 1024 / 1024).toFixed(1)}MB) ` +
        `exceeds limit (${(maxTotalSize / 1024 / 1024).toFixed(1)}MB)`
      );
    }

    if (zipInfo.fileCount > maxFileCount) {
      throw new Error(
        `Archive contains ${zipInfo.fileCount} files, exceeds limit of ${maxFileCount}`
      );
    }

    if (zipInfo.largestFile > maxFileSize) {
      throw new Error(
        `Archive contains file larger than ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`
      );
    }

    const ratio = zipInfo.uncompressedSize / compressedSize;
    if (ratio > maxCompressionRatio) {
      throw new Error(
        `Archive compression ratio ${ratio.toFixed(0)}:1 exceeds safety threshold`
      );
    }

    // Safe to extract
    await extract(zipPath, { dir: destDir });
  } catch (err) {
    throw new Error(`Failed to extract artifact: ${err instanceof Error ? err.message : err}`);
  }
}

async function analyzeZipFile(zipPath: string): Promise<{
  uncompressedSize: number;
  compressedSize: number;
  fileCount: number;
  largestFile: number;
}> {
  // Would need a library like 'yauzl' or 'unzipper' to read central directory
  // without extracting the entire file
  // ... implementation
}
```

---

### 10. **Incomplete Temporary Directory Cleanup**

**Severity:** MEDIUM  
**Location:** `src/replay/sandbox.ts` L130-150, `src/sandbox/bugbox.ts` L170-175  
**CVSS:** 4.3 (AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N)

**Issue:**
Temporary directories created during artifact extraction and replay use best-effort cleanup (`force: true`). On Windows, if files are locked (antivirus scanning, still open), cleanup silently fails, leaving temp directories behind. Over time, this can:
1. Exhaust disk space in %temp%
2. Leave sensitive artifact data on disk (secrets, source code)
3. Create window for local privilege escalation if /tmp or %temp% doesn't have sticky bit on Unix

**Current Code:**
```typescript
// src/replay/sandbox.ts L146-150
try {
  fs.rmSync(result.tempDir, { recursive: true, force: true });
} catch {
  // Best effort — on Windows, locked handles may prevent immediate removal
}

// No tracking of cleanup failures
```

**Fix:**
```typescript
// src/utils/temp-cleanup.ts
export interface CleanupTracker {
  register(dir: string): void;
  cleanup(): CleanupResult;
}

export interface CleanupResult {
  cleaned: string[];
  failed: Array<{ path: string; reason: string }>;
}

export class TempCleanupTracker implements CleanupTracker {
  private dirs: Set<string> = new Set();
  private retries = 3;

  register(dir: string): void {
    this.dirs.add(dir);
  }

  cleanup(): CleanupResult {
    const cleaned: string[] = [];
    const failed: Array<{ path: string; reason: string }> = [];

    for (const dir of this.dirs) {
      let lastError: string | null = null;

      for (let attempt = 0; attempt < this.retries; attempt++) {
        try {
          // On Windows, unlock read-only files before deleting
          if (process.platform === 'win32') {
            this.unlockDir(dir);
          }

          fs.rmSync(dir, { recursive: true, force: true });
          cleaned.push(dir);
          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          if (attempt < this.retries - 1) {
            // Wait before retry
            const backoff = Math.min(100 * Math.pow(2, attempt), 1000);
            setTimeout(() => {}, backoff);
          }
        }
      }

      if (lastError) {
        failed.push({ path: dir, reason: lastError });
        // On final failure, log warning (don't throw)
        console.warn(`[bugproof] Warning: failed to cleanup temp directory: ${dir}`);
      }
    }

    // Warn if any cleanup failed
    if (failed.length > 0) {
      console.warn(`[bugproof] ${failed.length} temporary directories were not cleaned up.`);
      console.warn('Consider manually removing: ' + failed.map(f => f.path).join(', '));
    }

    return { cleaned, failed };
  }

  private unlockDir(dir: string): void {
    if (process.platform !== 'win32') return;
    spawnSync('icacls', [dir, '/grant:r', `${os.userInfo().username}:(F)`, '/T', '/C'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: 'pipe',
    });
  }
}
```

---

## Defense in Depth Recommendations

### 11. **Add Artifact Integrity Verification**

**Severity:** MEDIUM (Best Practice)  
**Location:** All artifact creation and loading points

Implement HMAC-based integrity verification:

```typescript
// src/utils/artifact-signing.ts
import { createHmac } from 'crypto';

export function signArtifact(
  manifest: ArtifactManifest,
  runConfig: RunConfig,
  failure: FailureRecord,
  secret: string
): string {
  const payload = JSON.stringify({
    manifest,
    runConfig: { ...runConfig, environment: Object.fromEntries(
      Object.entries(runConfig.environment).filter(([k]) => !k.includes('SECRET'))
    )},
    failure
  });

  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyArtifact(
  manifest: ArtifactManifest,
  runConfig: RunConfig,
  failure: FailureRecord,
  signature: string,
  secret: string
): boolean {
  const expected = signArtifact(manifest, runConfig, failure, secret);
  return expected === signature;
}
```

### 12. **Implement Audit Logging**

**Severity:** MEDIUM (Best Practice)  
**Location:** CLI entry points

```typescript
// src/utils/audit-log.ts
export function logAuditEvent(
  event: 'capture' | 'replay' | 'share' | 'load',
  details: Record<string, any>
): void {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    event,
    user: os.userInfo().username,
    cwd: process.cwd(),
    pid: process.pid,
    ...details
  };

  // Log to ~/.bugproof/audit.log
  const auditFile = path.join(os.homedir(), '.bugproof', 'audit.log');
  fs.appendFileSync(auditFile, JSON.stringify(entry) + '\n', {
    mode: 0o600  // Owner-only read/write
  });
}
```

---

## Dependency Security Assessment

### Current Dependencies
| Package | Version | Known Issues | Risk |
|---------|---------|--------------|------|
| archiver | ^7.0.1 | No critical CVEs | LOW |
| commander | ^11.0.0 | No critical CVEs | LOW |
| extract-zip | ^2.0.1 | **Path traversal not fully addressed** | **HIGH** |
| typescript | ^5.0.0 | No critical CVEs | LOW |

### Recommendations
1. **Do NOT upgrade extract-zip unless** a version >= 2.1.0 with path traversal fixes is released
2. Add `npm audit` to CI/CD pipeline with `--audit-level=high`
3. Implement SBOM (Software Bill of Materials) generation via `npm sbom`
4. Consider using `npm ci` instead of `npm install` to ensure lock file compliance

---

## Secure npm Publication Checklist

- [ ] Path traversal via extract-zip is mitigated (FIX #1)
- [ ] Artifact JSON schema validation implemented (FIX #2)
- [ ] GitHub token handling is sanitized (FIX #3)
- [ ] Windows firewall rule names are escaped (FIX #4)
- [ ] Windows sandbox limitations are documented (FIX #5)
- [ ] Registry modification script is properly escaped (FIX #6)
- [ ] Secret detection patterns are comprehensive (FIX #7)
- [ ] Command validation before execution (FIX #8)
- [ ] Zip bomb protection is implemented (FIX #9)
- [ ] Temp directory cleanup handles failures (FIX #10)
- [ ] Artifact integrity signing is optional (FIX #11)
- [ ] Audit logging is optional (FIX #12)
- [ ] Package.json includes `"prepublishOnly": "npm run build && npm run test && npm run lint && npm audit"`
- [ ] README includes security section with known limitations
- [ ] GitHub security policy is published (SECURITY.md)
- [ ] No secrets in package-lock.json or example artifacts
- [ ] Code signing for postinstall scripts (if supported)

---

## Remediation Timeline

| Priority | Issue | Target Date | Owner |
|----------|-------|-------------|-------|
| CRITICAL | Path traversal (extract-zip) | Before publish | @dev |
| CRITICAL | Artifact deserialization | Before publish | @dev |
| HIGH | Token exposure | Before publish | @dev |
| HIGH | Firewall rule injection | Before publish | @dev |
| HIGH | Windows isolation docs | Before publish | @dev |
| HIGH | Registry escaping | Before publish | @dev |
| MEDIUM | Secret patterns | v0.2.3 | @dev |
| MEDIUM | Command validation | v0.2.3 | @dev |
| MEDIUM | Zip bomb protection | v0.2.3 | @dev |
| MEDIUM | Temp cleanup | v0.2.3 | @dev |

---

## Conclusion

BugProof requires **at least 6 critical/high priority fixes** before npm publication. The tool's core functionality involves executing untrusted commands, so robust input validation, artifact verification, and sandbox isolation are essential.

The most critical issues are:
1. **Path traversal in archive extraction** — can escape sandbox
2. **Unvalidated JSON deserialization** — can enable code injection
3. **Incomplete Windows sandbox isolation** — false sense of security
4. **Token exposure** — leaks authentication credentials

Once these are remediated and documentation is updated with platform-specific limitations, BugProof can be safely published.

---

**Report Generated:** 2026-05-08  
**Classification:** Security Review  
**Confidence Level:** High (8/10)
