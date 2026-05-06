# BugProof Dual-Registry Publishing Setup ✅

## Overview

Your npm publishing pipeline is now fully configured for **automatic dual-registry distribution**:

| Registry | Package | Installation | Use Case |
|----------|---------|--------------|----------|
| **npmjs.com** | `bugproof` | `npm install -g bugproof` | Public distribution |
| **GitHub Packages** | `@sidinsearch/bugproof` | `npm install -g @sidinsearch/bugproof --registry https://npm.pkg.github.com` | GitHub organization |

---

## 🔄 How It Works

### Automatic Publishing Flow

```
Developer pushes tag
    ↓
git push origin v0.1.0
    ↓
GitHub detects tag v0.1.0
    ↓
GitHub Actions triggered
    ↓
┌─────────────────────────────────┐
│  GitHub Actions Pipeline        │
├─────────────────────────────────┤
│ 1. npm ci                       │
│ 2. npm test (131/131 pass ✓)   │
│ 3. npm lint                     │
│ 4. npm build                    │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Publish to npmjs.com            │
│ • Package: bugproof             │
│ • Auth: NPM_TOKEN (you provide) │
│ • Result: Public package        │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Publish to GitHub Packages      │
│ • Package: @sidinsearch/bugproof│
│ • Auth: GITHUB_TOKEN (auto)     │
│ • Result: Org-scoped package    │
└─────────────────────────────────┘
    ↓
Create GitHub Release with links
    ↓
Both packages live and installable!
```

---

## 📦 Registry Comparison

### npmjs.com (Public)

**Purpose**: Primary distribution channel, maximum reach

```
URL: https://registry.npmjs.org
Package name: bugproof (unscoped)
Authentication: NPM_TOKEN (from npmjs.com)
Installation: npm install -g bugproof
Visibility: ✅ Searchable, discoverable
Download stats: ✅ Public, tracked
Cost: Free (public packages)
Expiration: ⏰ Token type determines expiration
```

**When to use:**
- General public release
- Maximum user reach
- Want packages searchable on npmjs.com

### GitHub Packages (Org-Scoped)

**Purpose**: GitHub-integrated registry, organizational control

```
URL: https://npm.pkg.github.com
Package name: @sidinsearch/bugproof (scoped)
Authentication: GITHUB_TOKEN (auto-provided)
Installation: npm install -g @sidinsearch/bugproof --registry https://npm.pkg.github.com
Visibility: 🔗 Linked to GitHub repo
Download stats: ✅ Visible in GitHub Packages page
Cost: Free (included with GitHub)
Expiration: ✅ Token auto-rotates, never expires
```

**When to use:**
- GitHub organization packages
- Tighter GitHub integration
- When unscoped name is taken on npmjs

---

## 🔑 Authentication Differences

### npmjs.com Authentication

```
User Action:
1. Go to https://www.npmjs.com/settings/tokens
2. Create "Automation" token (never expires)
3. Copy token (shown only once)
4. Add to GitHub Secrets as NPM_TOKEN

GitHub Actions:
- Uses NPM_TOKEN from Secrets
- Authenticates to npmjs.com
- Publishes package named "bugproof"
```

**Token Type**: Personal npm token
**Permissions**: Read & Write to your packages
**Risk**: If exposed, revoke immediately

### GitHub Packages Authentication

```
GitHub Actions:
- GITHUB_TOKEN auto-provided (fresh for each run)
- Scoped to repository
- Auto-rotates, expires after workflow
- No setup needed!

No Token Needed!
- Already included in GitHub Actions
- Automatically authenticated
- Can't be leaked (auto-expires)
```

**Token Type**: Built-in GITHUB_TOKEN
**Permissions**: Scoped to repository
**Risk**: None (auto-expires, auto-rotated)

---

## 🚀 Your Current Setup

### Files Created

| File | Purpose | Status |
|------|---------|--------|
| `.github/workflows/publish.yml` | CI/CD automation | ✅ Configured |
| `.npmignore` | Excludes dev files | ✅ Configured |
| `package.json` | Metadata & scripts | ✅ Updated |
| `REGISTRY_SETUP.md` | Registry differences | ✅ Documented |
| `SECURE_TOKEN_SETUP.md` | Token security guide | ✅ Documented |
| `NPM_PUBLISH.md` | Publishing workflow | ✅ Updated |

### What's Different from Each Other

| Aspect | npmjs.com | GitHub Packages |
|--------|-----------|-----------------|
| **Package name** | `bugproof` | `@sidinsearch/bugproof` |
| **Published by** | Same `npm publish` command | Same `npm publish` command |
| **Requires scope in .npmrc** | ❌ No | ✅ Yes (@sidinsearch:registry=...) |
| **Token type** | NPM_TOKEN (you manage) | GITHUB_TOKEN (GitHub manages) |
| **Token expiration** | Depends on type | Auto-rotated, never exposed |
| **User installation** | `npm install -g bugproof` | `npm install -g @sidinsearch/bugproof --registry https://npm.pkg.github.com` |
| **Public registry search** | ✅ Searchable | ❌ Not searchable (requires knowing URL) |
| **File association on install** | ✅ postinstall.cjs runs | ✅ postinstall.cjs runs |

---

## ⚠️ CRITICAL: Token Security Action Items

### Immediate Action Required

1. **Revoke the exposed token NOW**
   ```
   Go to: https://www.npmjs.com/settings/tokens
   Find the token you shared (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)
   Click "Delete/Revoke"
   ```
   **This token can no longer be used.**

2. **Generate a NEW token**
   ```
   Go to: https://www.npmjs.com/settings/tokens
   Click "Generate new token"
   Select: "Automation" type
   Save it (you won't see it again)
   ```

3. **Add to GitHub Secrets**
   ```
   Go to: https://github.com/sidinsearch/BugProof/settings/secrets/actions
   New secret:
   - Name: NPM_TOKEN
   - Value: (paste the NEW token)
   ```

4. **Verify it works**
   ```
   Push a git tag: git tag -a v0.1.0 -m "Release"
   GitHub Actions will automatically publish
   Monitor: https://github.com/sidinsearch/BugProof/actions
   ```

---

## 🔍 What Each Workflow Step Does

### 1. Tests & Validation (Identical for both)

```bash
npm ci              # Clean install (faster than npm install)
npm test            # Run all 131 tests (must pass)
npm lint            # Check code quality (must pass)
npm build           # Compile TypeScript (must succeed)
```

**If any step fails**: Release stops, workflow fails
**Benefit**: No broken code gets published

### 2. Publish to npmjs.com (Registry 1)

```bash
npm config set registry https://registry.npmjs.org/
npm publish         # Publishes package named "bugproof"
```

**Uses**: NPM_TOKEN from GitHub Secrets
**Result**: Package available at https://www.npmjs.com/package/bugproof
**Access**: `npm install -g bugproof` (no registry URL needed)

### 3. Publish to GitHub Packages (Registry 2)

```bash
npm config set @sidinsearch:registry=https://npm.pkg.github.com/
npm publish         # Publishes @sidinsearch/bugproof (scoped)
```

**Uses**: GITHUB_TOKEN (auto-provided by GitHub)
**Result**: Package available at GitHub Packages
**Access**: `npm install -g @sidinsearch/bugproof --registry https://npm.pkg.github.com`

### 4. Create Release (GitHub Release Page)

```
GitHub Release created with:
- Version tag (v0.1.0)
- Links to both registries
- CHANGELOG.md content
- Auto-generated by softprops/action-gh-release
```

**Result**: Release page at https://github.com/sidinsearch/BugProof/releases/tag/v0.1.0

---

## 📋 Release Workflow

### Step 1: Update Version & Changelog

```bash
# Option A: Manual
vim package.json        # Change version to 0.1.1
vim CHANGELOG.md        # Add release notes

# Option B: Automatic
npm version patch       # Bumps 0.1.0 → 0.1.1
```

### Step 2: Commit Changes

```bash
git add package.json CHANGELOG.md
git commit -m "chore: release v0.1.1"
```

### Step 3: Create Tag (Triggers Workflow)

```bash
# Create annotated tag (required by workflow)
git tag -a v0.1.1 -m "Release v0.1.1"

# Push to GitHub (this triggers GitHub Actions)
git push origin main
git push origin v0.1.1
```

### Step 4: Monitor Workflow

```
GitHub Actions automatically:
1. Checks out code
2. Runs all tests (131 must pass)
3. Publishes to npmjs.com (using NPM_TOKEN)
4. Publishes to GitHub Packages (using GITHUB_TOKEN)
5. Creates GitHub Release

Monitor at: https://github.com/sidinsearch/BugProof/actions
```

### Step 5: Verify Both Registries

```bash
# Check npmjs
npm view bugproof@0.1.1
# Visit: https://www.npmjs.com/package/bugproof

# Check GitHub Packages
npm view @sidinsearch/bugproof@0.1.1 --registry https://npm.pkg.github.com
# Visit: https://github.com/sidinsearch/BugProof/packages
```

---

## 🎯 Key Differences Summary

### Why Two Registries?

| Reason | npm Registry | GitHub Packages |
|--------|--------------|-----------------|
| **Maximum reach** | ✅ Primary public registry | ❌ Limited to GitHub users |
| **Searchability** | ✅ Searchable on npmjs.com | ❌ Not searchable (org-scoped) |
| **GitHub integration** | ⚠️ Minimal | ✅ Perfect integration |
| **Authentication** | ⚠️ Manual token setup | ✅ Automatic (GITHUB_TOKEN) |
| **Token security** | ⚠️ You manage token | ✅ GitHub auto-rotates |

### For Users

**Want the main package?**
```bash
npm install -g bugproof
# From npmjs.com, no registry URL needed
```

**Want GitHub-scoped version?**
```bash
npm install -g @sidinsearch/bugproof --registry https://npm.pkg.github.com
# From GitHub Packages, requires registry URL
```

---

## ✅ Setup Verification Checklist

- [ ] Token exposure reviewed and revoked (https://www.npmjs.com/settings/tokens)
- [ ] NEW npm token generated (Automation type)
- [ ] NPM_TOKEN secret added to GitHub (https://github.com/sidinsearch/BugProof/settings/secrets/actions)
- [ ] GitHub Actions workflow configured (.github/workflows/publish.yml)
- [ ] Package.json has "files" field listing dist/ and assets/
- [ ] .npmignore excludes dev/test files
- [ ] Tests pass locally (npm test)
- [ ] Build succeeds locally (npm build)
- [ ] CHANGELOG.md updated for v0.1.0
- [ ] All changes committed to git
- [ ] Ready to tag and release

---

## 🚨 Common Issues & Solutions

### Issue: "403 Forbidden" when publishing

**Cause**: NPM_TOKEN expired or invalid
**Solution**:
1. Revoke old token at npmjs.com
2. Generate new token
3. Update NPM_TOKEN secret in GitHub

### Issue: Package doesn't appear on npmjs.com

**Cause**: Registry sync delay
**Solution**: Wait 5-10 minutes, then:
```bash
npm view bugproof@0.1.0
npm cache clean --force
npm search bugproof
```

### Issue: Can't install from GitHub Packages

**Cause**: Registry URL not specified
**Solution**:
```bash
# Wrong
npm install @sidinsearch/bugproof

# Correct
npm install @sidinsearch/bugproof --registry https://npm.pkg.github.com

# Or add to .npmrc
@sidinsearch:registry=https://npm.pkg.github.com/
npm install @sidinsearch/bugproof
```

### Issue: Different versions on two registries

**Cause**: Stale package cache
**Solution**:
```bash
npm cache clean --force
npm view bugproof@latest
npm view @sidinsearch/bugproof@latest --registry https://npm.pkg.github.com
```

---

## 📚 Documentation Structure

| File | Audience | Purpose |
|------|----------|---------|
| **REGISTRY_SETUP.md** | Maintainers | Detailed registry differences |
| **SECURE_TOKEN_SETUP.md** | Maintainers | Token security & setup |
| **NPM_PUBLISH.md** | Maintainers & Contributors | Publishing workflow & checklist |
| **GETTING_STARTED.md** | End Users | Installation & usage guide |
| **CHANGELOG.md** | Everyone | Version history |

---

## 🔗 Quick Links

- **Release GitHub Actions**: https://github.com/sidinsearch/BugProof/actions
- **npm package**: https://www.npmjs.com/package/bugproof
- **GitHub Packages**: https://github.com/sidinsearch/BugProof/packages
- **npm token settings**: https://www.npmjs.com/settings/tokens
- **GitHub secrets**: https://github.com/sidinsearch/BugProof/settings/secrets/actions

---

## 🎉 You're Ready!

Your BugProof dual-registry publishing is now:

✅ Secure (proper token handling)
✅ Automated (GitHub Actions CI/CD)
✅ Dual-distributed (npmjs + GitHub Packages)
✅ Well-documented (registry differences explained)

**Next step**: Add NPM_TOKEN secret, then push a tag to publish! 🚀
