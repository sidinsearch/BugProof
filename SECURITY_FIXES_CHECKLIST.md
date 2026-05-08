# BugProof Security Fixes - Implementation Checklist

**Status:** BLOCKING npm publication  
**Last Updated:** 2026-05-08

## Critical Fixes (MUST complete before publication)

### ✓ CRITICAL #1: Path Traversal in Archive Extraction
- **File:** `src/utils/archive.ts`
- **Issue:** extract-zip doesn't validate paths; attacker can escape sandbox via `../` sequences
- **Proof:** Create ZIP with `../../etc/passwd` entry, extract to temp dir
- **Fix:** Validate extracted paths before using them; check against isPathWithinBoundary
- **Tests Added:**
  - [x] Reject traversal entries via validator unit test
  - [x] Reject absolute path entries via validator unit test
  - [x] Existing extraction behavior preserved by archive integration test

### ✓ CRITICAL #2: Untrusted JSON Deserialization
- **File:** `src/cli.ts` L321-323
- **Issue:** JSON.parse on user-controlled artifact files without schema validation
- **Proof:** Craft JSON with `__proto__` or `constructor.prototype` pollution
- **Fix:** Implement strict schema validation with zod/joi; reject unknown fields
- **Tests Added:**
  - [x] Prototype pollution payload blocked
  - [x] Deep nesting payload blocked
  - [x] Type confusion blocked
  - [x] Unknown-field manifest blocked via replay e2e

### ✓ HIGH #3: GitHub Token Exposure
- **File:** `src/share/gist.ts` L150-160
- **Issue:** Token appears in error messages if API call fails
- **Proof:** Network failure during Gist creation prints stack trace with token
- **Fix:** Sanitize all error messages; remove token from error objects
- **Tests Added:**
  - [x] Sanitizer redacts bearer tokens and token-like payloads
  - [x] CLI share error path uses sanitized output

### ✓ HIGH #4: Firewall Rule Name Injection (Windows)
- **File:** `src/sandbox/network.ts` L132-145
- **Issue:** ruleName and exePath not validated before passing to netsh
- **Proof:** Craft ruleName with newlines to inject additional netsh commands
- **Fix:** Validate ruleName format; escape exePath; use crypto.randomBytes for rule name
- **Tests Added:**
  - [x] Reject newline/equal-sign rule names
  - [x] Reject unsafe executable paths
  - [x] Randomized rule naming verified in orchestrator tests

### ✓ HIGH #5: Incomplete Windows Sandbox Isolation
- **File:** `src/sandbox/capabilities.ts`, `src/sandbox/resources.ts`
- **Issue:** Tool claims Job Object isolation but doesn't provide true process isolation
- **Proof:** Replayed process can access host filesystem, network, env vars
- **Fix:** Update capabilities detection; document Windows limitations in README
- **Tests Added:**
  - [x] README now states Windows sandbox is best-effort
  - [x] Replay CLI prints explicit best-effort warning on Windows isolated/full modes

### ✓ HIGH #6: Insecure Windows Registry Modification
- **File:** `scripts/postinstall.cjs` L58-69
- **Issue:** CLI path and command not properly escaped for reg.exe
- **Proof:** Path with quotes breaks registry entry; registry value could be malicious
- **Fix:** Properly escape paths for reg.exe; add verification of registry write
- **Tests Added:**
  - [x] Path safety helper tests for spaces/control characters
  - [x] Command quoting/escaping tests for internal quotes
  - [x] Registry write verification query added in installer logic

## High Priority Fixes (MUST complete for v0.2.2 release)

### ✗ MEDIUM #7: Incomplete Secret Detection
- **File:** `src/utils/secrets.ts`
- **Issue:** SECRET_PATTERNS misses common secret formats; false positives on legitimate values
- **Fix:** Add AWS key patterns, Slack tokens, private keys, DB connection strings
- **Tests Needed:**
  - [ ] AWS key patterns (AKIA*, ASIA*)
  - [ ] Slack token formats
  - [ ] RSA/DSA private key headers
  - [ ] Database connection strings
  - [ ] Stripe, Twilio, SendGrid patterns

### ✗ MEDIUM #8: No Command Validation Before Execution
- **File:** `src/capture/engine.ts`, `src/replay/engine.ts`
- **Issue:** Command array not validated; no checks for path traversal, excessively long args
- **Fix:** Implement validateCommand function; check path traversal, arg lengths, array size
- **Tests Needed:**
  - [ ] Reject commands with `..` in executable name
  - [ ] Reject excessively long arguments (>8KB)
  - [ ] Reject oversized command arrays (>256 elements)
  - [ ] Warn on unqualified executable names

### ✗ MEDIUM #9: Zip Bomb / Decompression Attack
- **File:** `src/utils/archive.ts`
- **Issue:** No validation of compression ratio; no size limits on extraction
- **Proof:** Create 100000:1 compression ratio ZIP; extraction fills disk
- **Fix:** Validate compression ratio < 100:1; check total uncompressed size < 500MB
- **Tests Needed:**
  - [ ] Reject high compression ratio ZIPs
  - [ ] Reject ZIPs exceeding total size limit
  - [ ] Reject files exceeding individual file size limit
  - [ ] Reject archives with excessive file counts

### ✗ MEDIUM #10: Incomplete Temporary Directory Cleanup
- **File:** `src/replay/sandbox.ts`, `src/sandbox/bugbox.ts`
- **Issue:** Best-effort cleanup can fail silently on Windows; leaves sensitive data
- **Fix:** Implement CleanupTracker with retry logic; warn on persistent failures
- **Tests Needed:**
  - [ ] Simulate locked file (antivirus)
  - [ ] Retry cleanup with backoff
  - [ ] Warn user about leaked temp directories
  - [ ] Log cleanup failures for debugging

## Post-Publication (v0.2.3+)

### ✓ NICE-TO-HAVE #11: Artifact Integrity Signing
- **File:** New `src/utils/artifact-signing.ts`
- **Purpose:** HMAC-based integrity verification of artifacts
- **Depends On:** #2 (schema validation)
- **Timeline:** v0.2.3

### ✓ NICE-TO-HAVE #12: Audit Logging
- **File:** New `src/utils/audit-log.ts`
- **Purpose:** Log all capture/replay/share events to ~/.bugproof/audit.log
- **Timeline:** v0.2.3

---

## Testing & Verification

### Unit Tests Required
```bash
npm test -- src/utils/security.test.ts
npm test -- src/utils/archive.test.ts
npm test -- src/utils/secrets.test.ts
npm test -- src/replay/sandbox.test.ts
```

### E2E Tests Required
```bash
npm run test:e2e -- --security-focus
```

### Manual Testing Checklist
- [ ] Capture and replay on Windows, Linux, macOS
- [ ] Test with paths containing spaces/special chars
- [ ] Test sandbox isolation at each level (workspace, isolated, full)
- [ ] Test secret redaction with real API keys
- [ ] Test artifact sharing with GitHub token
- [ ] Test registry association on Windows
- [ ] Test file open from Explorer/Finder on Windows/macOS

### Security Review Sign-Off
- [ ] Code review by @reviewer
- [ ] Security testing completed
- [ ] All CRITICAL and HIGH issues resolved
- [ ] Documentation updated with limitations
- [ ] No hardcoded secrets in code or examples
- [ ] Dependencies scanned with `npm audit`
- [ ] Ready for npm publication

---

## PR Template for Fixes

```markdown
## Security Fix: [Issue #N]

### Issue
[Description from SECURITY_AUDIT.md]

### Root Cause
[Why this vulnerability exists]

### Fix
[Implementation details]

### Testing
- [ ] Unit tests added/updated
- [ ] E2E tests pass
- [ ] Manual testing completed
- [ ] No regressions

### Security Impact
[Describe how this fix improves security posture]

### Before/After
[If applicable, show vulnerable vs. fixed code]
```

---

## Rollout Plan

1. **Phase 1: Critical Fixes (Week 1)**
   - [ ] Fix #1: Path traversal
   - [ ] Fix #2: JSON validation
   - [ ] Fix #3: Token exposure
   - Create v0.2.1 release with critical fixes

2. **Phase 2: High-Priority Fixes (Week 2)**
   - [ ] Fix #4: Firewall injection
   - [ ] Fix #5: Windows isolation docs
   - [ ] Fix #6: Registry escaping
   - Create v0.2.2 release

3. **Phase 3: Medium-Priority Fixes (Week 3)**
   - [ ] Fix #7: Secret patterns
   - [ ] Fix #8: Command validation
   - [ ] Fix #9: Zip bomb protection
   - [ ] Fix #10: Temp cleanup
   - Create v0.2.3 release

4. **Phase 4: Publication (Week 4)**
   - [ ] All fixes verified
   - [ ] npm publish v0.2.3

  <!-- Workflow test: auto-trigger commit -->
  Workflow test trigger: 2026-05-08T00:00:00Z
   - [ ] Announce security fixes in CHANGELOG

---

## Contact & Escalation

- **Security Issues:** Report privately to [security-contact]
- **Critical Issues:** Immediate notification required
- **Disclosure:** 90-day coordinated disclosure policy
