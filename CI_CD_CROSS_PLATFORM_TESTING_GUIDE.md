# BugProof: Cross-Platform CI/CD Testing Guide

## Test Coverage Summary (Current)

**All 276 tests pass — No coverage loss**

| Category | Coverage | Status |
|----------|----------|--------|
| **Overall** | 76% statements | ✅ Solid |
| **Security-critical modules** | | |
| └─ artifact-validation.ts | 78.65% | ✅ Covered |
| └─ archive.ts | 87.23% | ✅ Covered |
| └─ sandbox/network.ts | 78.57% | ✅ Covered |
| **Other key modules** | | |
| └─ capture/engine.ts | 92.72% | ✅ Excellent |
| └─ replay/verdict.ts | 97.05% | ✅ Excellent |
| └─ utils/security.ts | 100% | ✅ Perfect |
| └─ diff/engine.ts | 93.33% | ✅ Excellent |

---

## Test Matrix: What Gets Tested

### 1. Unit & Integration Tests (34 test suites)

- **Capture** (4 suites): git strategies, language detection, packaging, env snapshots
- **Replay** (3 suites): verdict determination, hints, sandbox orchestration
- **Sandbox** (5 suites): filesystem, network, process isolation, cross-platform, capabilities
- **Utils** (10 suites): archive safety, artifact validation, security, secrets, fingerprinting
- **Config** (1 suite): loader, templates, merging
- **Diff** (1 suite): artifact comparison
- **Share** (1 suite): gist API, error sanitization
- **Scripts** (1 suite): postinstall registry/firewall operations
- **Integration** (2 suites): multi-language support, language context
- **E2E** (1 suite): Full CLI workflows (capture → inspect → replay → diff)

### 2. Language Support Matrix

Tested via `tests/integration/multi-language-dummy.test.ts`:
- **Python** (2 and 3)
- **JavaScript/Node.js**
- **Java**
- **C/C++** (gcc, g++)
- **Go**
- **Rust**
- **Ruby** (if available)
- **PHP** (if available)

### 3. CI-Specific Stability Fixes

All tests now run reliably in GitHub Actions CI environment:
- ✅ No global Git identity required (tests use local git config)
- ✅ No hardcoded environment assumptions
- ✅ No timezone-dependent logic
- ✅ No file-system race conditions (unique temp dirs per test)

---

## Running Tests Locally (Windows)

### Quick test (current machine)

```bash
npm ci
npm run build
npm test
```

**Expected output:**
```
Test Suites: 34 passed, 34 total
Tests:       276 passed, 276 total
Time:        ~23-27 seconds
```

### With coverage report

```bash
npx jest --coverage
```

Outputs coverage summary + HTML report in `coverage/lcov-report/index.html`

---

## Cross-Platform Testing: Windows + Remote Linux

### Setup: Prepare Your Local Machine

```bash
# Build the project
npm run build

# Create a tarball for fresh-install testing
npm pack
# Produces: bugproof-0.2.2.tgz (or current version)
```

### Test on Windows (Local)

```bash
# 1. Full test suite
npm test

# 2. Fresh-install test (simulating user install)
npm i -g ./bugproof-0.2.2.tgz
bugproof --help
bugproof capture ./tests/e2e/fixtures/sample-project --out C:\tmp\artifacts
bugproof replay C:\tmp\artifacts\artifact-*.tgz

# 3. Multi-language matrix (9 languages)
node scripts/multi-language-matrix.cjs

# 4. Security audit
npm audit --production
```

### Test on Remote Linux Machine

#### A. SSH into Linux machine

```bash
ssh tester@linux-test-1.example.internal
```

#### B. Configure Git (for test isolation)

```bash
git config --global user.name "BugProof Test"
git config --global user.email "bugproof-test@example.com"
```

#### C. Ensure Node.js >= 18

```bash
# Via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.4/install.sh | bash
source ~/.bashrc
nvm install 18
node -v  # v18.x.x

# Or via apt
sudo apt update
sudo apt install -y nodejs npm
node -v
```

#### D. Transfer and test

**Option 1: From Windows PowerShell (with OpenSSH)**

```powershell
# Copy tarball
scp .\bugproof-0.2.2.tgz tester@linux-test-1:/tmp/

# Copy repo for full test runs
scp -r . tester@linux-test-1:/home/tester/bugproof-source
```

**Option 2: From Linux controller machine (better)**

```bash
rsync -av --progress . tester@linux-test-1:/home/tester/bugproof-source
```

#### E. Run tests on Linux

**SSH into the remote machine and run:**

```bash
cd /home/tester/bugproof-source

# 1. Full test suite
npm ci
npm run build
npm test -- --runInBand

# Output should match Windows results:
# Test Suites: 34 passed, 34 total
# Tests:       276 passed, 276 total

# 2. Fresh-install test
npm i -g /tmp/bugproof-0.2.2.tgz
bugproof --help
bugproof capture ./tests/e2e/fixtures/sample-project --out /tmp/artifacts
bugproof replay /tmp/artifacts/artifact-*.tgz

# 3. Multi-language matrix
node scripts/multi-language-matrix.cjs | tee multi-lang-matrix.log

# 4. Security audit
npm audit --production

# 5. Generate coverage
npx jest --coverage

# 6. Collect results for download
tar czf /tmp/test-results-$(date +%Y%m%d-%H%M%S).tgz \
  coverage \
  multi-lang-matrix.log \
  /tmp/artifacts
```

#### F. Download results back to Windows

From Windows PowerShell:

```powershell
scp tester@linux-test-1:/tmp/test-results-*.tgz ./test-results-linux.tgz

# Extract and review
7z x test-results-linux.tgz
```

---

## Automated Cross-Platform Controller Script

Create `scripts/ci/remote-test.sh` for automated testing across machines:

```bash
#!/bin/bash
# Usage: ./scripts/ci/remote-test.sh linux-test-1 linux-test-2
# Tests on multiple remote machines in parallel

REMOTE_1="${1:-linux-test-1.example.internal}"
REMOTE_2="${2:-linux-test-2.example.internal}"
USER="tester"

echo "=== Building locally ==="
npm ci
npm run build
npm pack

TARBALL=$(ls bugproof-*.tgz | head -1)

echo "=== Starting tests on $REMOTE_1 and $REMOTE_2 ==="

# Test on both machines in parallel
(
  echo "=== Testing on $REMOTE_1 ==="
  ssh $USER@$REMOTE_1 'bash -s' <<EOF
  cd ~/bugproof-source
  npm ci
  npm run build
  npm test -- --runInBand > test-results-$REMOTE_1.log 2>&1
  npm audit --production > audit-$REMOTE_1.log 2>&1
  tar czf /tmp/results-$REMOTE_1.tgz test-results-$REMOTE_1.log audit-$REMOTE_1.log
EOF
  scp $USER@$REMOTE_1:/tmp/results-$REMOTE_1.tgz ./results-$REMOTE_1.tgz
) &

(
  echo "=== Testing on $REMOTE_2 ==="
  ssh $USER@$REMOTE_2 'bash -s' <<EOF
  cd ~/bugproof-source
  npm ci
  npm run build
  npm test -- --runInBand > test-results-$REMOTE_2.log 2>&1
  npm audit --production > audit-$REMOTE_2.log 2>&1
  tar czf /tmp/results-$REMOTE_2.tgz test-results-$REMOTE_2.log audit-$REMOTE_2.log
EOF
  scp $USER@$REMOTE_2:/tmp/results-$REMOTE_2.tgz ./results-$REMOTE_2.tgz
) &

wait

echo "=== All tests complete. Results downloaded ==="
tar tzf results-*.tgz | head
```

---

## Expected Test Results (Pass Criteria)

### Windows (Local)

```
✅ Test Suites: 34 passed, 34 total
✅ Tests:       276 passed, 276 total
✅ Coverage:    76% statements (≥75% target met)
✅ Audit:       0 critical vulnerabilities
✅ Multi-lang matrix: All 9 languages captured/replayed successfully
```

### Linux (Remote)

Same as Windows — results should be identical across platforms:

```
✅ Test Suites: 34 passed, 34 total
✅ Tests:       276 passed, 276 total
✅ Coverage:    76% statements (consistent with Windows)
✅ Audit:       0 critical vulnerabilities
✅ Multi-lang matrix: All 9 languages captured/replayed successfully
```

---

## Troubleshooting

### Test fails on Linux but passes on Windows

**Cause:** Usually git configuration or missing system tools.

**Fix:**
```bash
# Configure git (one-time)
git config --global user.name "BugProof Test"
git config --global user.email "bugproof-test@example.com"

# Install missing language toolchains
sudo apt install -y python3 openjdk-11-jdk gcc g++ rustc golang-1.20
```

### Fresh-install fails on Linux: "postinstall not found"

**Cause:** The `dist/cli.js` wasn't built before packing.

**Fix:**
```bash
npm run build  # Ensure dist/ is populated
npm pack       # Create fresh tarball
npm i -g ./bugproof-*.tgz  # Try again
```

### E2E tests timeout in CI

**Cause:** Large artifacts or slow network in remote.

**Fix:**
```bash
# Run with explicit timeout increase
npm test -- tests/e2e/cli.test.ts --testTimeout=60000
```

---

## CI/CD GitHub Actions Setup

Add to your workflow (e.g., `.github/workflows/test.yml`):

```yaml
name: Test & Release

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: [18, 20]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      - run: git config --global user.email "ci@example.com"
      - run: git config --global user.name "CI Bot"
      - run: npm ci
      - run: npm run build
      - run: npm test -- --runInBand
      - run: npm audit --production
```

---

## Test Coverage Goals (Next Phase)

Current coverage is solid, but target these modules for enhancement:

| Module | Current | Target | Path |
|--------|---------|--------|------|
| artifact-validation | 78.65% | 85% | Add prototype pollution tests |
| archive | 87.23% | 92% | Add symlink + bomb tests |
| sandbox/network | 78.57% | 88% | Add firewall error scenarios |

**Estimated effort:** 2–3 hours per module for adversarial test cases.

---

## Next Steps

1. ✅ **Tests pass locally on Windows** — verify all 276 pass
2. ⏳ **Run on Linux remote** — confirm cross-platform consistency
3. ⏳ **Fresh-install verification** — test npm install from tarball
4. ⏳ **Multi-language matrix** — verify all 9 languages work
5. ⏳ **Final audit & security review** — use security-reviewer agent
6. ⏳ **Create PR & ship** — bump version, update CHANGELOG, publish

---

**Last updated:** 2026-05-08
**Test Status:** 🟢 All 276 tests passing | 🟢 76% coverage | 🟢 CI-stable
