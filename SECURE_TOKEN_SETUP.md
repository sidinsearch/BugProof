# 🔐 Secure NPM Token Setup for GitHub Actions

## ⚠️ CRITICAL SECURITY NOTICE

**Your npm token that was shared in plain text must be revoked immediately!**

Any npm token that has been shared publicly is compromised and should never be used again.

### Step 1: Revoke the Exposed Token (IMMEDIATELY)

1. Go to https://www.npmjs.com/settings/tokens
2. Find the token you shared (the one starting with `npm_`)
3. Click the **Delete/Revoke** button
4. Confirm deletion

**This token cannot be used anymore and is now useless to anyone who saw it.**

---

## Step 2: Generate a NEW NPM Token

### Option A: Generate via Web UI (Recommended)

1. Go to https://www.npmjs.com/settings/tokens
2. Click **"Generate new token"**
3. Select token type:
   - **"Automation"** (Recommended for CI/CD)
     - No expiration date
     - Read & Write permissions
4. Click **"Create"**
5. **Copy the token immediately** (you won't see it again)

### Option B: Generate via CLI

```bash
npm login --auth-type=oauth --registry=https://registry.npmjs.org
# Follow OAuth flow

npm token create --read-and-write
# Generates a token for publishing
```

### Token Types Explained

| Type | Use Case | Expiration |
|------|----------|------------|
| **Automation** | CI/CD pipelines (GitHub Actions, etc.) | Never expires |
| **Publish** | Publishing packages from CLI | 30 days (default) |
| **Read-only** | Installing packages (not needed for publishing) | Never expires |

**For GitHub Actions, use "Automation" type.**

---

## Step 3: Safely Store Token in GitHub

### ✅ DO: Store in GitHub Secrets

1. Open your repo: https://github.com/sidinsearch/BugProof
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Fill in:
   - **Name**: `NPM_TOKEN`
   - **Value**: (paste the token you just generated)
5. Click **Add secret**

**✅ Now the token is encrypted and only accessible to GitHub Actions workflows**

### ❌ DON'T: Store These Places

- ❌ Git repository (in `.npmrc`, package.json, or any file)
- ❌ Plain text files
- ❌ Chat/email/Slack
- ❌ Environment variables in `.env` (committed to git)
- ❌ README or documentation files

---

## Step 4: Verify GitHub Actions Workflow

### Check that .github/workflows/publish.yml has:

```yaml
- name: Publish to npmjs
  run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}  # ✅ Uses secret from GitHub
```

**The workflow automatically passes the secret to npm at publish time.**

---

## Step 5: Test the Pipeline (Without Publishing)

### Dry-run without actually publishing:

```bash
# Run locally (requires npm login or .npmrc)
npm publish --dry-run

# This shows what WOULD be published without uploading
```

### When Ready to Publish:

```bash
# Create a git tag to trigger GitHub Actions
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0

# GitHub Actions automatically publishes using NPM_TOKEN
# https://github.com/sidinsearch/BugProof/actions
```

---

## Understanding the Secure Flow

```
┌─────────────────────────────────────────────────────────┐
│  You (Developer)                                        │
│  • Generate token on npmjs.com                          │
│  • Copy token once, never again                         │
│  • DO NOT store locally or commit                       │
└────────────────────┬────────────────────────────────────┘
                     │ (one-time copy)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  GitHub Secrets (Encrypted)                             │
│  • Store NPM_TOKEN securely                             │
│  • Only accessible to GitHub Actions                    │
│  • Never displayed, only used in workflows              │
└────────────────────┬────────────────────────────────────┘
                     │ (automated injection)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  GitHub Actions Workflow (Runtime)                      │
│  • ${{ secrets.NPM_TOKEN }} injected at runtime         │
│  • Only available during workflow execution             │
│  • Immediately purged after workflow completes          │
└────────────────────┬────────────────────────────────────┘
                     │ (npm authenticate)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  npmjs.com                                              │
│  • Authenticates with NPM_TOKEN                         │
│  • Publishes your package                               │
│  • Token never stored, only transmitted                 │
└─────────────────────────────────────────────────────────┘
```

---

## Common Mistakes & How to Avoid Them

### ❌ Mistake 1: Storing token in .npmrc (committed to git)

```ini
# .npmrc - DON'T COMMIT THIS!
//registry.npmjs.org/:_authToken=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
```

**Problem**: Anyone with git history can see your token

**Solution**: Use GitHub Secrets instead

```yaml
# .github/workflows/publish.yml
env:
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}  # ✅ Correct
```

### ❌ Mistake 2: Printing token in workflow logs

```yaml
# Wrong: Token shows in logs
- run: echo "Token is ${{ secrets.NPM_TOKEN }}"

# Correct: Token stays hidden (npm handles it internally)
- run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### ❌ Mistake 3: Sharing token to test

```bash
# Don't send token via email/Slack for someone to test
# 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  # ❌ EXPOSED!

# Instead: Let GitHub Actions handle it
# Just push a tag, workflow publishes automatically  # ✅ Secure
```

---

## Token Rotation Best Practices

### When to Rotate Tokens

- ✅ After token is exposed/shared
- ✅ Quarterly (every 3 months) for security
- ✅ When changing GitHub org/repo ownership
- ✅ When leaving a team/organization

### How to Rotate

```bash
# 1. Generate new token at npmjs.com
# 2. Update GitHub secret:
#    Settings → Secrets → NPM_TOKEN → Update value
# 3. Revoke old token at npmjs.com
# 4. Next workflow run uses new token automatically
```

---

## Checking Token Status

### See your tokens on npmjs.com

```bash
npm token list
# Lists all your tokens (but NOT the token values)
```

### Verify token is in GitHub

```bash
# In GitHub Actions, you can verify the token is loaded:
- name: Verify token
  run: |
    if [ -z "$NODE_AUTH_TOKEN" ]; then
      echo "❌ Token not loaded!"
      exit 1
    else
      echo "✅ Token loaded (value hidden for security)"
    fi
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## FAQ

**Q: Can I see my token once I've saved it?**
A: No. GitHub intentionally doesn't display secrets after saving. If you lose it, generate a new one.

**Q: What if the token expires?**
A: "Automation" tokens don't expire. If you need expiring tokens, use "Publish" type (30 days).

**Q: Can someone use the token if they see it?**
A: Yes! They can publish packages to your npm account. Always revoke exposed tokens immediately.

**Q: Is it safe to use GITHUB_TOKEN for GitHub Packages?**
A: Yes! GITHUB_TOKEN is:
- Generated fresh for each workflow run
- Automatically scoped to the repo
- Automatically revoked after workflow completes

**Q: Do I need two tokens (npm + GitHub)?**
A: Yes:
- **NPM_TOKEN**: For publishing to npmjs.com
- **GITHUB_TOKEN**: Auto-provided by GitHub Actions for GitHub Packages

**Q: Can I test publishing locally?**
A: Yes:
```bash
npm publish --dry-run
# Shows what would be published, doesn't actually upload
```

---

## Next Steps

1. **Revoke exposed token**: https://www.npmjs.com/settings/tokens
2. **Generate new token**: https://www.npmjs.com/settings/tokens
3. **Add to GitHub**: Settings → Secrets → NPM_TOKEN
4. **Push a tag**: `git push origin v0.1.0`
5. **Monitor workflow**: https://github.com/sidinsearch/BugProof/actions

---

## Security Checklist

- [ ] Old/exposed token revoked
- [ ] New token generated on npmjs.com
- [ ] NPM_TOKEN secret added to GitHub
- [ ] `.npmrc` not committed to git
- [ ] Token value not in any documentation
- [ ] GitHub Actions workflow uses `${{ secrets.NPM_TOKEN }}`
- [ ] Test publish succeeds
- [ ] Packages appear on both registries

**Once all checked: You're secure and ready to publish! ✅**
