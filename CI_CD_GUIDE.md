# CI/CD Pipeline Documentation

## Overview

BugProof uses a production-grade **automated CI/CD pipeline** built with GitHub Actions. This pipeline ensures code quality, cross-platform compatibility, and reliable npm publishing.

---

## Pipeline Stages

### 1️⃣ **Test Matrix** (Parallel Tests on All Platforms)

**Runs on:** Ubuntu, Windows, macOS | **Node versions:** 18, 20

- ✅ Install dependencies (npm ci)
- ✅ Build TypeScript (tsc → dist/)
- ✅ Run full test suite (Jest, 276 tests)
- ✅ Run linter (ESLint)
- ✅ Upload coverage reports
- ✅ Capture test logs on failure

**Status:** All 3 OSes × 2 Node versions must pass

---

### 2️⃣ **Security Audit** (Dependencies & Vulnerabilities)

**Runs on:** Ubuntu only

- ✅ npm audit (non-blocking)
- ✅ Check for outdated dependencies
- ✅ Create npm package tarball
- ✅ Upload package artifact for later stages

---

### 3️⃣ **Smoke Install** (Cross-Platform Installation Test)

**Runs on:** Ubuntu, Windows, macOS

- ✅ Download package tarball from security-audit
- ✅ Install package in temp directory
- ✅ Verify CLI version outputs correctly
- ✅ Verify CLI help works
- ✅ Test capture command help

**Purpose:** Ensures the packaged tarball is installable and CLI works on all OSes

---

### 4️⃣ **Auto Bump & Tag** (Version Management)

**Triggers:** Only on `main` branch push (after smoke tests pass)

- ✅ Bump patch version (0.2.2 → 0.2.3)
- ✅ Create annotated git tag (v0.2.3)
- ✅ Push tag to origin (triggers publish job)

---

### 5️⃣ **Publish to npm** (Registry Publishing)

**Triggers:** 
- On git tag push (v*) OR
- Manual workflow dispatch with `publish=true`

**Requires:** `NPM_TOKEN` secret configured in GitHub

- ✅ Build production bundle
- ✅ Publish to npmjs registry
- ✅ Wait for registry propagation
- ✅ Create GitHub Release

---

### 6️⃣ **Post-Publish Verification** (Sanity Check)

**Runs:** After publish job completes

- ✅ Wait for npm registry propagation (30s)
- ✅ Install package globally
- ✅ Verify CLI version and help
- ✅ Test artifact creation
- ✅ Report pass/fail status

---

## Trigger Rules

```
Event              | Trigger Condition
─────────────────────────────────────────────
Push to main       | Test matrix → security → smoke → bump → tag
Git tag (v*)       | Publish to npm + GitHub Release
Manual dispatch    | Optional publish with publish=true flag
Pull request       | Test matrix only (no publish)
```

---

## Setup Instructions

### Prerequisites

- ✅ Node.js 18+ (project requirement)
- ✅ npm account with access to `bugproof` package
- ✅ GitHub repository with Actions enabled

### 1. Configure NPM_TOKEN Secret

This is **required** for the publish job to run.

#### Steps:

1. Generate npm token on npmjs.com:
   - Visit https://www.npmjs.com/settings/~/tokens
   - Create new token (Automation type recommended)
   - Copy the token

2. Add to GitHub:
   - Go to repo → Settings → Secrets and variables → Actions
   - New repository secret
   - Name: `NPM_TOKEN`
   - Value: `npm_xxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Save

3. Verify:
   ```bash
   # On next push to main, workflow will create a tag
   # Then publish job will run and publish to npm
   git log --oneline | head -5  # Look for "Release v0.2.x" commit
   git describe --tags           # Verify tag created
   ```

---

## Local Validation

Before pushing, run the CI health check locally:

```bash
# Full CI/CD validation
node scripts/ci-health-check.js

# Or individual checks:
npm run build          # TypeScript build
npm test              # Full test suite
npm run lint          # ESLint
npm run test:coverage # Coverage report
```

---

## Workflow Matrix Details

### Test Matrix (6 Combinations)

| OS        | Node 18 | Node 20 | Status |
|-----------|---------|---------|--------|
| Ubuntu    | ✅      | ✅      | 2 runs |
| Windows   | ✅      | ✅      | 2 runs |
| macOS     | ✅      | ✅      | 2 runs |

All 6 must pass before proceeding to security/smoke stages.

### Smoke Install (3 Tests)

Validates package on all operating systems.

| OS        | Package Install | CLI Verify | Capture Help |
|-----------|-----------------|------------|--------------|
| Ubuntu    | ✅              | ✅         | ✅           |
| Windows   | ✅              | ✅         | ✅           |
| macOS     | ✅              | ✅         | ✅           |

---

## Artifact Management

### Uploaded by Pipeline

- **coverage-report** — Jest coverage HTML/JSON (30 days)
- **test-logs-\*-node\*** — npm logs on test failure (7 days)
- **package-tarball** — npm pack tarball (7 days)

View artifacts:
- GitHub Actions → [Workflow run] → "Artifacts" section

---

## Common Issues & Fixes

### ❌ "npm audit failed"
- **Solution:** Non-blocking. Pipeline continues.
- **Action:** Review warnings, update vulnerable deps.

### ❌ "Test matrix failed on Windows"
- **Check:** Windows filesystem test logs artifact
- **Common cause:** Permission handling (now fixed with attrib)
- **Solution:** Already implemented in filesystem.ts

### ❌ "Publish job didn't run"
- **Check:** NPM_TOKEN secret is configured
- **Fix:** Settings → Secrets → Add NPM_TOKEN
- **Verify:** Re-run workflow

### ❌ "Package not visible on npm"
- **Cause:** Registry propagation (30-90s typical)
- **Solution:** Wait 1-2 minutes, then check npm registry
- **Verify:** `npm view bugproof@VERSION`

---

## Manual Workflow Dispatch

Publish without pushing:

```bash
# Via GitHub CLI (if installed):
gh workflow run release.yml \
  -f publish=true

# Via GitHub UI:
# 1. Go to Actions → CI/CD Pipeline
# 2. Run workflow
# 3. Set publish=true
# 4. Execute
```

---

## Monitoring & Debugging

### Watch Live Workflow

```bash
# Via GitHub CLI:
gh run list --workflow=release.yml --limit=5
gh run view <run-id> --log

# Via GitHub UI:
# Actions → CI/CD Pipeline → Latest run
```

### View Logs

Each job logs to GitHub Actions:
- Test outputs
- Build output
- npm audit results
- Publish confirmation

### Check Package Published

```bash
# After publish completes:
npm view bugproof@0.2.3
npm info bugproof@latest

# Install and verify:
npm install -g bugproof@0.2.3
bugproof --version
```

---

## Performance Metrics

### Typical Pipeline Duration

| Stage | Duration | Notes |
|-------|----------|-------|
| Test matrix | 4-6 min | Parallel 6 combinations |
| Security audit | 1-2 min | Sequential |
| Smoke install | 2-3 min | Parallel 3 OSes |
| Bump + tag | 1 min | Sequential |
| Publish | 2-3 min | Sequential + registry wait |
| **Total** | **10-15 min** | End-to-end |

---

## Security Considerations

### Secrets Management

- ✅ NPM_TOKEN stored in GitHub Secrets (encrypted)
- ✅ Never committed to repo
- ✅ Only accessible to workflows
- ✅ Rotated annually recommended

### Dependencies

- ✅ npm audit runs on every push
- ✅ CVE warnings surfaced
- ✅ Outdated packages flagged

### Code Review

- All changes reviewed before merging to main
- Tests run on PRs (pull requests)
- No auto-publish from PRs

---

## Best Practices

### 1. **Always Run Locally First**
```bash
npm run build && npm test && npm run lint
```

### 2. **Commit Tests with Code**
```bash
# Each feature should include tests
git add src/feature.ts tests/feature.test.ts
git commit -m "feat: add feature with tests"
```

### 3. **Monitor Workflow Runs**
```bash
# After pushing, check Actions tab
# Ensure all 6 test matrix combinations pass
```

### 4. **Document Changes**
Update CHANGELOG.md before release:
```markdown
## v0.2.3 (2026-05-04)
- ✨ Feature X
- 🐛 Fix Y
```

### 5. **Use Semantic Versioning**
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features
- **Patch** (0.0.1): Bug fixes (auto-bumped)

---

## Continuous Integration Benefits

✅ **Automated Testing**
- Every push tested on all platforms
- No manual test runs needed

✅ **Quality Gates**
- All tests must pass before publishing
- Linter catches code style issues

✅ **Version Management**
- Automatic patch version bumping
- Semantic tagging for releases

✅ **Cross-Platform Confidence**
- Tests on Ubuntu, Windows, macOS simultaneously
- Catch OS-specific bugs early

✅ **Production Readiness**
- Every published package validated
- Post-publish sanity checks included

---

## Next Steps

1. ✅ Configure NPM_TOKEN secret
2. ✅ Push to main branch
3. ✅ Monitor workflow run (Actions tab)
4. ✅ Verify package published to npm
5. ✅ Celebrate! 🎉

---

## References

- GitHub Actions Docs: https://docs.github.com/en/actions
- npm Publishing: https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages
- Semantic Versioning: https://semver.org
- This Workflow: [`.github/workflows/release.yml`](.github/workflows/release.yml)

---

**Questions?** Check the workflow run logs in GitHub Actions or review the release.yml workflow file.
