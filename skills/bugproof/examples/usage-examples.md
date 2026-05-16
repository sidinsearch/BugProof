# BugProof Usage Examples

Real-world examples of using BugProof to capture, replay, and debug failures.

---

## Example 1: Node.js Module Not Found

### Scenario
A Node.js application crashes with `Error: Cannot find module 'express'`.

### Capture

```bash
bugproof capture -n node-missing-module -- node app.js
```

### Artifact Contents
- Command: `node app.js`
- Exit code: 1
- Error: `Error: Cannot find module 'express'`
- Captured files: `app.js`, `package.json`
- Environment: `NODE_PATH`, `PATH`

### Replay

```bash
bugproof replay node-missing-module.bug
```

### Verdict
`MATCH` — The same error reproduces.

### Fix
```bash
npm install express
```

---

## Example 2: Python Test Timeout

### Scenario
A Python test hangs and never completes.

### Capture

```bash
bugproof capture -n python-timeout --timeout 30000 -- python -m pytest tests/test_api.py::test_slow_endpoint
```

### Artifact Contents
- Command: `python -m pytest tests/test_api.py::test_slow_endpoint`
- Exit code: 124 (timeout)
- Output: Partial test output before timeout
- Captured files: Test file, source file, conftest.py

### Replay

```bash
bugproof replay python-timeout.bug
```

### Verdict
`MATCH` — The test times out on both machines.

### Fix
Add timeout to the test or fix the hanging code.

---

## Example 3: Go Test Failure

### Scenario
A Go test fails with an assertion error.

### Capture

```bash
bugproof capture -n go-test-fail -- go test ./pkg/calculator -run TestDivide
```

### Artifact Contents
- Command: `go test ./pkg/calculator -run TestDivide`
- Exit code: 1
- Output: `--- FAIL: TestDivide (0.00s) calculator_test.go:15: expected 2, got 0`
- Captured files: `calculator.go`, `calculator_test.go`, `go.mod`, `go.sum`

### Replay

```bash
bugproof replay go-test-fail.bug
```

### Verdict
`MATCH` — The same test failure reproduces.

### Fix
Fix the division logic in `calculator.go`.

---

## Example 4: Java ClassNotFoundException

### Scenario
A Java application fails to start with `ClassNotFoundException`.

### Capture

```bash
bugproof capture -n java-classnotfound -- java -cp target/myapp.jar com.example.Main
```

### Artifact Contents
- Command: `java -cp target/myapp.jar com.example.Main`
- Exit code: 1
- Error: `Exception in thread "main" java.lang.ClassNotFoundException: com.example.Main`
- Captured files: `target/myapp.jar`, `pom.xml`

### Replay

```bash
bugproof replay java-classnotfound.bug
```

### Verdict
`MATCH` — The same exception reproduces.

### Fix
Check the classpath or rebuild the JAR.

---

## Example 5: Cross-Platform Path Issue

### Scenario
A script works on Linux but fails on Windows due to path separators.

### Capture on Linux

```bash
bugproof capture -n linux-path -- ./scripts/build.sh
```

### Replay on Windows

```bash
bugproof replay linux-path.bug
```

### Verdict
`NO_MATCH` — The script fails differently on Windows.

### Diff

```bash
# Capture on Windows too
bugproof capture -n windows-path -- .\scripts\build.sh

# Compare
bugproof diff linux-path.bug windows-path.bug
```

### Differences Found
- Path separators: `/` vs `\`
- Line endings: LF vs CRLF
- Shell: bash vs cmd

### Fix
Use cross-platform path handling in the script.

---

## Example 6: API Endpoint Failure

### Scenario
An API endpoint returns 500 Internal Server Error.

### Capture

```bash
bugproof capture -n api-500 -- curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/users
```

### Artifact Contents
- Command: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/users`
- Exit code: 0
- Output: `500`
- Captured files: Server source code, config files

### Replay

```bash
bugproof replay api-500.bug
```

### Verdict
`MATCH` — The endpoint returns 500 on both machines.

### Fix
Check server logs and fix the endpoint handler.

---

## Example 7: CI/CD Pipeline Failure

### Scenario
A CI pipeline fails but works locally.

### Capture in CI

```yaml
# .github/workflows/ci.yml
- name: Capture failure on CI
  if: failure()
  run: |
    npx bugproof capture -n ci-failure -- npm test
    npx bugproof share ci-failure.bug
```

### Replay Locally

```bash
# Download the shared artifact
bugproof pull <url-from-ci>

# Replay
bugproof replay ci-failure.bug
```

### Verdict
`NO_MATCH` — Works locally but fails in CI.

### Diff

```bash
# Capture locally too
bugproof capture -n local-pass -- npm test

# Compare
bugproof diff ci-failure.bug local-pass.bug
```

### Differences Found
- Different Node.js version
- Different environment variables
- Missing test fixtures in CI

### Fix
Align CI environment with local environment.

---

## Example 8: Intermittent Test Failure

### Scenario
A test fails randomly, about 1 in 10 runs.

### Capture

```bash
# Run multiple times to catch the failure
for i in {1..20}; do
  bugproof capture -n flaky-test-run-$i -- npm test -- --grep "flaky test" || true
done
```

### Analyze

```bash
# Compare successful and failing runs
bugproof diff flaky-test-run-1.bug flaky-test-run-5.bug
```

### Differences Found
- Different random seed
- Different timing
- Race condition in async code

### Fix
Add proper synchronization or mock the timing-dependent code.
