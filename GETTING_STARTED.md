# Getting Started with BugProof

BugProof is now available on npm! Install it globally to capture and replay bugs from anywhere.

## Installation

### From npm (Recommended)

```bash
npm install -g bugproof
```

### From GitHub Packages

If you prefer to install from GitHub:

```bash
npm install -g @sidinsearch/bugproof --registry https://npm.pkg.github.com
```

## Quick Start (30 seconds)

### 1. Capture a bug

Run any failing command through BugProof. It records everything:

```bash
bugproof capture -- npm test
# or
bugproof capture -- python script.py
# or
bugproof capture -- cargo test
```

A `.bug` file is created with all the context needed to reproduce it.

### 2. Replay the bug

Send the `.bug` file to a teammate (via email, Slack, GitHub, etc.). They can instantly replay it:

```bash
bugproof replay my-bug.bug
```

Output:
```
✓ REPRODUCTION CONFIRMED
Expected exit    1
Actual exit      1
Verdict          Exact fingerprint match
```

### 3. Inspect without running

Don't want to execute the bug? Just inspect it:

```bash
bugproof inspect my-bug.bug
```

Shows metadata, environment, command, and failure details — **without running code**.

### 4. Compare two bugs

See what changed between two artifacts:

```bash
bugproof diff old-bug.bug new-bug.bug
```

## CLI Help

Full command list:

```bash
bugproof --help
```

Command-specific help:

```bash
bugproof help capture
bugproof help replay
bugproof help inspect
bugproof help diff
```

## Common Workflows

### Capture with metadata

```bash
bugproof capture \
  -n "auth-timeout" \
  -d "Login fails when session expires after 30min" \
  -- node server.js
```

### Exclude large files

```bash
bugproof capture \
  --exclude "*.log" \
  --exclude "node_modules" \
  -- npm test
```

### Replay with environment overrides

```bash
bugproof replay \
  --env API_URL=https://staging.example.com \
  --env DEBUG=true \
  my-bug.bug
```

### JSON mode for CI/CD

```bash
bugproof capture --json -- npm test > result.json
bugproof replay --json my-bug.bug > verdict.json
```

## What Gets Captured

Each `.bug` artifact contains:

- **Source code** — Git-tracked files (snapshots the exact code)
- **Command** — The exact command that failed
- **Environment** — Variables and configuration (secrets redacted)
- **Output** — Full stdout and stderr
- **Metadata** — OS, Node version, git commit, branch
- **Fingerprint** — Exit code + error patterns for matching

## What's NOT Captured

For security, BugProof skips:

- API keys, tokens, passwords (redacted automatically)
- Untracked files (unless `--include-untracked`)
- node_modules, .git, build artifacts (configurable)
- Node process internals

## File Association (Optional)

After install, you can double-click `.bug` files to replay them:

**Windows:**
```powershell
# Already registered during install
# Or manually:
regedit /s scripts/bugproof-file-association-windows.reg
```

**Linux:**
```bash
sudo bash scripts/bugproof-file-association-linux.sh
```

**macOS:**
```bash
bash scripts/bugproof-file-association-macos.sh
```

## Sharing Bugs

`.bug` files are just ZIP archives. You can safely share them:

- **Email** — Send as attachment
- **Slack** — Upload directly
- **GitHub** — Attach to issues
- **Cloud** — Store in S3, Google Drive, etc.
- **Version control** — Commit to Git (they're small: 100KB–5MB)

## Cross-Platform Replay

Capture on Windows, replay on Linux (or any other combo):

```bash
# Windows
> bugproof capture -- java -jar App.jar
# JavaNullPointer.bug is created

# Linux (different machine)
$ bugproof replay JavaNullPointer.bug
✓ REPRODUCTION CONFIRMED
```

This works because BugProof captures source code (not binaries) and recompiles on replay.

## Troubleshooting

**"Command not found: bugproof"**
```bash
npm link  # Or verify npm is in your PATH
```

**"Git is required"**
- BugProof needs Git to capture the exact code state
- Install Git: https://git-scm.com/

**"Failed to capture — not a git repo"**
- BugProof requires the command to run in a git repository
- Initialize with: `git init && git add . && git commit -m "init"`

**"Cross-platform replay not working"**
- Ensure target platform has Node.js 18+ and Git
- Verify language toolchains are installed (Java, Python, etc.)
- Check firewall/network if comparing across machines

## Getting Help

- **Issues**: https://github.com/sidinsearch/BugProof/issues
- **Discussions**: https://github.com/sidinsearch/BugProof/discussions
- **README**: [Full documentation](README.md)

## Next Steps

- Explore [NPM_PUBLISH.md](NPM_PUBLISH.md) to publish your own version
- Check [CHANGELOG.md](CHANGELOG.md) for version history
- Read [README.md](README.md) for complete reference

---

Happy bug capturing! 🐛
