# NPM Publishing Guide

BugProof is published to both [npmjs.com](https://www.npmjs.com/package/bugproof) and [GitHub Packages](https://github.com/sidinsearch/BugProof/packages).

## Prerequisites

1. **npm account** — Sign up at https://www.npmjs.com/signup
2. **npm login** — Run `npm login` locally to authenticate
3. **npm token** — Generate at https://www.npmjs.com/settings/tokens
4. **GitHub token** — Generate at https://github.com/settings/tokens

## Publishing Workflow

### Manual Release (Local)

```bash
# 1. Ensure everything is committed
git status

# 2. Run the release script
npm run release

# This will:
# - Run test suite
# - Run linter
# - Build TypeScript
# - Create git tag (v0.1.0)
# - Push tag to GitHub

# 3. Publish to npm
npm publish

# 4. Publish to GitHub Packages (optional)
npm publish --registry https://npm.pkg.github.com
```

### Automated Release (GitHub Actions)

When you push a git tag matching `v*` pattern, GitHub Actions automatically:
1. Checks out code
2. Installs dependencies
3. Runs tests and linter
4. Builds TypeScript
5. Publishes to npm (requires `NPM_TOKEN` secret)
6. Publishes to GitHub Packages (uses `GITHUB_TOKEN`)
7. Creates a GitHub Release

**Setup:**
1. Add `NPM_TOKEN` secret to GitHub repository settings:
   - Go to Settings → Secrets and variables → Actions
   - New repository secret → `NPM_TOKEN` → paste npm token
2. Commit `.github/workflows/publish.yml`
3. Push a tag: `git push origin v0.2.0`

## Versioning

BugProof follows [Semantic Versioning](https://semver.org/):
- **MAJOR** — Breaking API changes
- **MINOR** — New features (backward compatible)
- **PATCH** — Bug fixes

Examples:
- `0.1.0` — Initial release
- `0.2.0` — Add new feature
- `0.2.1` — Fix bug
- `1.0.0` — First stable release

## Publishing Checklist

Before releasing:

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] CHANGELOG.md updated with new version
- [ ] package.json version updated (if not automatic)
- [ ] README.md docs are current
- [ ] No uncommitted changes: `git status`
- [ ] Create git tag: `git tag -a v0.X.Y -m "Release v0.X.Y"`

## npm Registry Configuration

To publish consistently, ensure `.npmrc` is configured:

```ini
# ~/.npmrc (local)
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=YOUR_NPM_TOKEN

# For GitHub Packages (optional)
@sidinsearch:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

## Installation from npm

After publishing, users can install with:

```bash
# Global install (recommended for CLI)
npm install -g bugproof

# Local install
npm install bugproof
```

## Troubleshooting

**"403 Forbidden" when publishing**
- Verify you're logged in: `npm whoami`
- Check npm token is valid and not expired
- Ensure package name is unique (or you have publish rights)

**"Package size exceeds limit"**
- Check `.npmignore` is excluding unnecessary files
- Verify `files` field in package.json
- Run `npm pack` to see what will be published

**"Version already published"**
- Increment version in package.json
- Create new git tag
- Re-run publish

## Package Contents

The npm package includes:
- `dist/` — Compiled JavaScript (ES modules)
- `assets/` — Icon files for file association
- `scripts/` — Post-install setup scripts
- `README.md` — Documentation
- `CHANGELOG.md` — Version history
- `LICENSE` — MIT license

Everything else (tests, docs, dev configs) is excluded via `.npmignore`.

## Monitoring

After publishing:
- Check npm registry: https://www.npmjs.com/package/bugproof
- Check GitHub Packages: https://github.com/sidinsearch/BugProof/packages
- Monitor for issues: https://github.com/sidinsearch/BugProof/issues

## Links

- **npm package**: https://www.npmjs.com/package/bugproof
- **GitHub repo**: https://github.com/sidinsearch/BugProof
- **Issues**: https://github.com/sidinsearch/BugProof/issues
- **Discussions**: https://github.com/sidinsearch/BugProof/discussions
