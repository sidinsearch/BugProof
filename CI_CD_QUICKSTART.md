# CI/CD Quick Setup

> Get production-grade CI/CD running in 5 minutes

## What You'll Have

✅ **Automated Testing** — Ubuntu, Windows, macOS (Node 18 & 20)  
✅ **Security Checks** — npm audit on every push  
✅ **Smoke Tests** — Installation validation on all platforms  
✅ **Auto Versioning** — Patch version bumped automatically  
✅ **Auto Publishing** — npm registry updates on release  
✅ **Cross-Platform** — One workflow, all OSes  

---

## 5-Minute Setup

### Step 1: Generate npm Token (2 min)

1. Visit https://www.npmjs.com/settings/~/tokens
2. **Create New Token** → Select **Automation** type
3. Copy the token (starts with `npm_`)

**⚠️ Save this token now — you can't retrieve it later**

### Step 2: Add to GitHub (2 min)

1. Go to your GitHub repo
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret**
   - **Name:** `NPM_TOKEN`
   - **Value:** Paste the npm token
   - **Save**

### Step 3: Test It (1 min)

```bash
# Make a small change or just push:
git push origin main

# Watch workflow run:
# - Go to Actions tab
# - Click "CI / CD Pipeline" 
# - Watch tests run on all platforms
```

---

## That's It! 🎉

Your CI/CD is now running. Here's what happens on each push:

```
Push to main
    ↓
Test matrix (6 platforms × Node versions)
    ↓
Security audit
    ↓
Smoke install (verify package)
    ↓
Auto bump version + create tag
    ↓
Publish to npm registry
    ↓
Post-publish verification
    ↓
GitHub Release created
```

---

## Verify It Works

After the workflow completes (~10 minutes):

```bash
# Check published package:
npm view bugproof@latest

# Install latest version:
npm install -g bugproof@latest

# Verify:
bugproof --version
```

---

## What Happens When

| Event | Pipeline |
|-------|----------|
| **Push to main** | Tests + security + auto-bump + publish |
| **Pull request** | Tests only (no publish) |
| **Tag (v*)** | Publish + GitHub Release |
| **Manual trigger** | On-demand publish |

---

## Troubleshooting

### ❌ Publish didn't run

**Check:** Was NPM_TOKEN configured?
```bash
# GitHub → Settings → Secrets → Look for NPM_TOKEN
```

If missing, add it again (step 2 above).

### ❌ Tests failed on Windows

**Check:** GitHub Actions logs
- Go to Actions → Last run
- Click the failed job
- Scroll to failed test

Most Windows issues are already fixed. If you see permission errors, please file an issue.

### ❌ Package not on npm

**Wait:** Registry propagation takes 30-90 seconds
```bash
# After waiting:
npm view bugproof@latest
```

---

## Next Steps

- 📖 Read [CI_CD_GUIDE.md](./CI_CD_GUIDE.md) for full documentation
- 🧪 Run local validation: `node scripts/ci-health-check.js`
- 📝 Update CHANGELOG.md before releases
- 🔄 Monitor workflow runs in Actions tab

---

## Help

- **Workflow issues?** Check `.github/workflows/release.yml`
- **Test failures?** Run `npm test` locally
- **npm publish errors?** Verify NPM_TOKEN has publish permissions
- **Questions?** See CI_CD_GUIDE.md

---

**Status**: ✅ Ready for production releases!
