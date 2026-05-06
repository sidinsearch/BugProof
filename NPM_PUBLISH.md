# NPM Publishing Guide — Dual Registry Strategy

BugProof is published to both **npmjs.com** (public) and **GitHub Packages** (GitHub-hosted) automatically via GitHub Actions.

## 📦 Publishing Registries

### npmjs.com (Primary - Public Registry)

```bash
npm install -g bugproof
```

- **Package name**: `bugproof` (unscoped)
- **URL**: https://www.npmjs.com/package/bugproof
- **Authentication**: NPM_TOKEN from npmjs.com
- **Best for**: Public distribution, maximum discoverability

### GitHub Packages (Secondary - GitHub-Hosted Registry)

```bash
npm install -g @sidinsearch/bugproof --registry https://npm.pkg.github.com
```

- **Package name**: `@sidinsearch/bugproof` (scoped)
- **URL**: https://npm.pkg.github.com/@sidinsearch/bugproof
- **Authentication**: GITHUB_TOKEN (auto-provided)
- **Best for**: GitHub organization, tighter integration

## 🔐 Prerequisites

### For npmjs.com Publishing

1. **Create npm account**: https://www.npmjs.com/signup
2. **Generate npm token**:
   - https://www.npmjs.com/settings/tokens
   - Type: "Automation" (recommended for CI/CD)
   - Permissions: Read & Write
3. **Add to GitHub Secrets**:
   - Go to Repo Settings → Secrets and variables → Actions
   - New secret → Name: `NPM_TOKEN` → Paste token
4. **⚠️ IMPORTANT**: Never commit or share the token!

### For GitHub Packages Publishing

- ✅ **Automatic** — GITHUB_TOKEN is provided by GitHub Actions
- ✅ No additional setup needed
- Repository must have public visibility or GitHub org membership

## 📋 Publishing Workflow

### Automated (Recommended)

Push a git tag to trigger automatic publication:

```bash
# 1. Update version in package.json (or use npm version)
npm version patch  # or minor/major

# 2. Update CHANGELOG.md with release notes

# 3. Commit changes
git add package.json CHANGELOG.md
git commit -m "chore: bump to v0.1.1"

# 4. Create and push tag
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin main
git push origin v0.1.1

# 5. GitHub Actions automatically:
#    → Runs tests
#    → Builds TypeScript
#    → Publishes to npmjs.com (using NPM_TOKEN)
#    → Publishes to GitHub Packages (using GITHUB_TOKEN)
#    → Creates GitHub Release
```

**Monitor progress**: https://github.com/sidinsearch/BugProof/actions

### Manual (Testing/Development)

```bash
# Test locally without publishing (dry-run)
npm publish --dry-run

# Publish to npmjs.com (requires npm login or NPM_TOKEN in .npmrc)
npm publish

# Publish to GitHub Packages (requires GitHub token in .npmrc)
npm config set @sidinsearch:registry=https://npm.pkg.github.com/
npm config set //npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
npm publish
```

## 📚 Key Differences: npmjs vs GitHub Packages

| Feature | npmjs.com | GitHub Packages |
|---------|-----------|-----------------|
| Package name | `bugproof` (unscoped) | `@sidinsearch/bugproof` (scoped) |
| Public discovery | ✅ Searchable on npmjs.com | ❌ Only on GitHub |
| Authentication | NPM_TOKEN (personal) | GITHUB_TOKEN (org/repo) |
| Registry URL | Default (npmjs.org) | Must specify in .npmrc |
| Best for | General public | GitHub organization |
| Installation | `npm install -g bugproof` | `npm install -g @sidinsearch/bugproof --registry https://npm.pkg.github.com` |

**See [REGISTRY_SETUP.md](./REGISTRY_SETUP.md) for detailed comparison**

## 🚀 Release Checklist

Before publishing:

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] CHANGELOG.md updated with new version section
- [ ] package.json version matches release version
- [ ] README.md docs are up-to-date
- [ ] Git working directory clean: `git status`
- [ ] NPM_TOKEN secret configured in GitHub

## 🔧 GitHub Actions Workflow

Our `.github/workflows/publish.yml` automatically:

```yaml
1. Checkout code
2. Setup Node.js 18
3. Install dependencies (npm ci)
4. Run tests (npm test)
5. Run linter (npm lint)
6. Build (npm build)
7. Publish to npmjs.com
   - npm config set registry https://registry.npmjs.org/
   - npm publish (with NPM_TOKEN)
8. Publish to GitHub Packages
   - npm config set @sidinsearch:registry=https://npm.pkg.github.com/
   - npm publish (with GITHUB_TOKEN)
9. Create GitHub Release
   - Includes links to both registries
   - Links to CHANGELOG.md
```

## 📝 Versioning Strategy

BugProof follows [Semantic Versioning](https://semver.org/):

- **0.1.0** — Current: Initial release
- **0.2.0** — Next: New features (npm polish)
- **0.3.0** — Cloud storage integration
- **1.0.0** — Stable release

| Change | Version | When |
|--------|---------|------|
| MAJOR | 1.0.0 | Breaking API changes |
| MINOR | 0.2.0 | New features (backward compatible) |
| PATCH | 0.1.1 | Bug fixes |

## 🛠️ Troubleshooting

### "403 Forbidden" on npm publish

**Problem**: NPM_TOKEN invalid or expired

**Solution**:
1. Go to https://www.npmjs.com/settings/tokens
2. Check if token still exists
3. If expired, generate new token
4. Update GitHub secret with new token

### Package not appearing on npmjs.com

**Problem**: Delay in registry sync

**Solution**: Wait 5-10 minutes, then:
```bash
npm view bugproof@0.1.1
# Or check: https://www.npmjs.com/package/bugproof
```

### "Package @sidinsearch/bugproof not found"

**Problem**: GitHub Packages requires explicit registry

**Solution**: Include registry URL:
```bash
npm install @sidinsearch/bugproof --registry https://npm.pkg.github.com
# Or add to .npmrc:
@sidinsearch:registry=https://npm.pkg.github.com/
```

### Duplicate version error

**Problem**: Attempting to publish same version twice

**Solution**: Increment version first:
```bash
npm version patch
git add package.json CHANGELOG.md
git commit -m "chore: bump version"
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin main --tags
```

## 📊 Package Contents

The published npm package includes:

```
dist/                                # Compiled JavaScript
├── cli.js                          # CLI entry point
├── capture/, replay/, diff/        # Core engines
├── sandbox/                        # Sandbox system
└── utils/, types/                  # Utilities & types

assets/                            # Icon files
├── icon-16x16.png
├── icon-32x32.png
└── icon-512x512.png

scripts/
├── postinstall.cjs               # Auto-setup script
└── bugproof-file-association-*.{sh,reg}

README.md, CHANGELOG.md, LICENSE
```

**Excluded** (via .npmignore):
- Tests
- Source TypeScript
- Development dependencies
- Build configs
- CI/CD files

## 🔗 Useful Links

- **npm package**: https://www.npmjs.com/package/bugproof
- **GitHub Packages**: https://github.com/sidinsearch/BugProof/packages
- **GitHub repo**: https://github.com/sidinsearch/BugProof
- **Issues**: https://github.com/sidinsearch/BugProof/issues
- **Discussions**: https://github.com/sidinsearch/BugProof/discussions

## 📚 Documentation Files

- [SECURE_TOKEN_SETUP.md](./SECURE_TOKEN_SETUP.md) — Token security & setup
- [REGISTRY_SETUP.md](./REGISTRY_SETUP.md) — Registry differences explained
- [GETTING_STARTED.md](./GETTING_STARTED.md) — User installation guide
- [CHANGELOG.md](./CHANGELOG.md) — Version history
- [NPM_RELEASE_SETUP.md](./NPM_RELEASE_SETUP.md) — Quick reference

---

**Next**: Add NPM_TOKEN secret to GitHub, then push a tag to publish!
