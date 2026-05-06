# GitHub Actions v0.1.0 Release - Troubleshooting Guide

## What We Know

✅ **Commit 22578d1 (v0.1.0 tag)** - Contains all test fixes  
✅ **All 131 tests passing locally** - Package ready  
✅ **npm build succeeds** - TypeScript compiled  
✅ **Git tag v0.1.0 pushed** - Workflow should be triggered  
✅ **Repository accessible** - Remote push/pull working  

## Possible Failure Points

### 1. **Workflow Did Not Trigger** ⚠️
The tag might not have triggered the workflow if:
- GitHub's event filters blocked it
- The workflow file has syntax errors
- The push was too fast after tag creation

**Check:** Look at https://github.com/sidinsearch/BugProof/actions (need authentication)

### 2. **Check for Core Package Changes Step Failed**
The regex pattern in publish.yml might not match the commit files:

Current pattern:
```
^(src/|scripts/|tests/|package.json|package-lock.json|tsconfig.json|jest.config.js|assets/|dummy-project/bugs/)
```

Files in commit 22578d1:
- ✅ `src/utils/paths.ts` - matches `src/`
- ✅ `tests/replay/sandbox.test.ts` - matches `tests/`
- ✅ `tests/utils/paths.test.ts` - matches `tests/`
- ❌ `TEST_FIXES.md` - does NOT match

**Fix:** The regex should still match because of the src/ and tests/ files, so this is unlikely to be the issue.

### 3. **NPM Publish Failed** ⚠️
Most likely: NPM_TOKEN secret issue

Common reasons:
- **Token expired** - NPM tokens expire after a period of inactivity
- **Token revoked** - We exposed the token earlier, GitHub Actions may have automatically revoked it
- **Token permissions** - Token doesn't have publish permissions
- **Version already published** - 0.1.0 already exists on npmjs.com

**Check:** 
- Go to https://www.npmjs.com/package/bugproof
- Look for v0.1.0 (if it exists, that's the issue)

### 4. **GitHub Packages Publish Failed**
Less likely (uses auto-provided GITHUB_TOKEN), but possible reasons:
- Package scoping issue (@sidinsearch/bugproof)
- GitHub org permissions issue
- Organization doesn't exist

### 5. **Create Release Step Failed**
If publish succeeded but release creation failed:
- Might have still published but release not created
- Check npm registries for the package

## How to Debug

### Option 1: Check NPM Package Registry
```bash
# See if bugproof v0.1.0 exists
npm view bugproof@0.1.0

# See all versions
npm view bugproof versions
```

### Option 2: Check GitHub Packages
```bash
npm view @sidinsearch/bugproof@0.1.0 --registry=https://npm.pkg.github.com
```

### Option 3: Check Workflow Logs (Requires GitHub Authentication)
1. Go to: https://github.com/sidinsearch/BugProof/actions
2. Find the v0.1.0 tag workflow run
3. Click to expand each step
4. Look for red ✗ or error messages

### Option 4: Re-run Specific Step (If Only One Step Failed)
1. Go to failed workflow run
2. Click "Re-run failed jobs"
3. Watch logs in real-time

## Most Likely Issue: Expired/Revoked NPM_TOKEN

### Why?
- We exposed the token in the conversation (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)
- GitHub Actions or npm may have automatically revoked it
- Or it was invalidated due to security concerns

### How to Fix:
1. Generate a new NPM token at: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Type: "Automation" (allows npm publish)
   - Packages: "bugproof" (or "All packages")
   - Expiration: 90 days minimum
2. Copy the new token
3. Update the secret in GitHub: https://github.com/sidinsearch/BugProof/settings/secrets/actions
   - Name: NPM_TOKEN
   - Value: (paste new token)
4. Re-run the workflow

## Quick Diagnosis Commands

Run these locally to identify issues:

```bash
# 1. Check package.json is valid
npm lint package.json

# 2. Verify build artifacts exist
ls dist/

# 3. Simulate npm publish (dry-run)
npm publish --dry-run

# 4. Check if version already exists
npm view bugproof@0.1.0

# 5. Simulate GitHub Packages publish
npm publish --registry=https://npm.pkg.github.com --dry-run
```

## Action Items

1. **Immediately:** Get the error message from GitHub Actions
   - Screenshot or paste the workflow error
   - Share which step failed

2. **If NPM token issue:**
   - Generate new token
   - Update GitHub secret
   - Re-run workflow

3. **If version already exists:**
   - Either: increment to 0.1.1 and retry
   - Or: check if 0.1.0 is already published

4. **If workflow never triggered:**
   - Delete local tag: `git tag -d v0.1.0`
   - Force push main again: `git push origin main --force`
   - Create fresh tag: `git tag -a v0.1.0 -m "Release v0.1.0"`
   - Push: `git push origin v0.1.0`

## Expected Next Steps (Once Fixed)

After workflow completes successfully:
1. Package appears on npmjs: `npm install -g bugproof`
2. Package appears on GitHub Packages: `npm install -g @sidinsearch/bugproof --registry https://npm.pkg.github.com`
3. Release appears at: https://github.com/sidinsearch/BugProof/releases/tag/v0.1.0

---

**Next:** Please share the specific GitHub Actions error message so we can fix it immediately.
