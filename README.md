# BugProof

<div align="center">

![BugProof Logo](assets/icon-512x512.png?raw=true&size=200)

**"Executable bugs, not bug reports."**

Capture a backend/CLI bug into a portable `.bug` artifact that anyone can run locally to reproduce the issue instantly.

```
Bug = Code + Inputs + Environment + Execution Context
```

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-131%20passed-brightgreen)]()
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-blue)]()
[![Cross-Platform](https://img.shields.io/badge/Cross--Platform-Windows%20%7C%20Linux%20%7C%20macOS-blueviolet)]()

</div>

## Key Features

- 🚀 **Portable bug artifacts** — `.bug` files reproduce bugs exactly, anywhere (Windows → Linux, macOS → Windows, etc.)
- 🛠️ **Instant reproduction** — no "works on my machine" confusion; exact failure fingerprint matching
- 🔒 **Security First** — automatic secret redaction (API keys, tokens, passwords), sandbox isolation
- 🐧🪟🍎 **True Cross-Platform** — capture on any OS, replay on any OS with exact fingerprint matches
- 📊 **CI-Ready** — structured JSON output for automated regression checks
- 🎯 **Language-Agnostic** — Java, C, C++, Python, Node.js, Go, Rust, and more
- ⚡ **Zero Runtime Dependencies** — just Node.js and Git

---

## Quick Start

### 1. Install

**Requirements:** Node.js 18+ and Git.

```bash
git clone https://github.com/sidinsearch/BugProof.git
cd BugProof
npm install
npm run build
npm link
```

#### File Association Setup (Optional)

**Windows:**
1. Right-click `scripts/bugproof-file-association-windows.reg`
2. Click "Merge with Registry"
3. Restart File Explorer

Or from PowerShell (admin):
```powershell
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

After setup, you can **double-click `.bug` files** to replay them instantly.

### 2. Capture a bug

Run a failing command through BugProof. It records everything needed to reproduce it:

```bash
bugproof capture -- python app.py

# or with metadata
bugproof capture -n "auth-crash" -d "Login fails when session expires" -- node server.js
```

A `.bug` file is generated with:
- ✓ Complete source code snapshot (git-tracked files)
- ✓ Environment variables (secrets redacted)
- ✓ Command and arguments
- ✓ Full stdout/stderr output
- ✓ Failure fingerprint (exit code + error patterns)
- ✓ Git commit hash for reproducibility

### 3. Replay & Verify

Share the `.bug` artifact with anyone. They can reproduce the exact failure instantly:

```bash
bugproof replay my-bug.bug
# =>
#  > Extracting compressed artifact...
#  > Replaying command...
#  
#  + REPRODUCTION CONFIRMED
#  Expected exit    1
#  Actual exit      1
#  Verdict          Reproduction confirmed (exact fingerprint match)
```

---

## Commands

### `capture` — Record a failing command

Runs a command, records its failure, snapshots git-tracked source files, and packages everything into a `.bug` artifact.

```bash
# Simple capture
bugproof capture -- python app.py

# With metadata
bugproof capture -n auth-crash -d "Login fails when session expires" -- node server.js

# Capture with environment variables
bugproof capture -e PATH,HOME -- java -cp . App.class

# Exclude sensitive files
bugproof capture --exclude "*.log,secrets.txt" -- npm test
```

**Options:**
- `-n, --name <name>` — Name the artifact (default: auto-generated)
- `-d, --description <text>` — Add description for the bug
- `-e, --env-include <list>` — Include specific environment variables (default: safe set)
- `--exclude <patterns>` — Exclude files matching patterns
- `--timeout <ms>` — Command timeout in milliseconds (default: 30000)
- `--json` — Output result as JSON for CI/automation

### `replay` — Execute a captured bug artifact

Opens a `.bug` artifact and re-executes the captured command in an isolated sandbox, comparing the failure signature.

```bash
# Standard replay
bugproof replay my-bug.bug

# Strict version matching (fail if commit doesn't match)
bugproof replay --version-match strict my-bug.bug

# Replay in sandbox isolation mode
bugproof replay --sandbox strict my-bug.bug

# Output JSON for CI
bugproof replay --json my-bug.bug
```

**Options:**
- `--version-match <mode>` — `off` (default), `soft` (warn), `strict` (error if mismatch)
- `--sandbox <mode>` — `current` (fast), `strict` (git worktree), `branch` (git worktree at branch tip)
- `--json` — Output verdict as JSON
- `--timeout <ms>` — Override artifact timeout

### `inspect` — Examine a bug artifact

Prints the contents of a `.bug` artifact without execution. Useful for audit and debugging.

```bash
# Standard inspect
bugproof inspect my-bug.bug

# JSON output
bugproof inspect --json my-bug.bug

# Show specific sections
bugproof inspect --show manifest my-bug.bug
bugproof inspect --show environment my-bug.bug
```

**Options:**
- `--json` — Machine-readable output
- `--show <section>` — Filter to specific section

### `diff` — Compare two bug artifacts

Compares two `.bug` artifacts side by side to show changes in failure patterns, environment, or source code.

```bash
# Compare two artifacts
bugproof diff artifact-v1.bug artifact-v2.bug

# JSON output
bugproof diff --json artifact-v1.bug artifact-v2.bug
```

**Compares:**
- Exit code changes
- Error pattern differences
- Environment variable changes
- Source code diffs
- Performance changes

---

## Cross-Platform Replay

BugProof fully supports capturing on one platform and replaying on another:

| From \ To | Windows | Linux | macOS |
|-----------|---------|-------|-------|
| **Windows** | ✅ | ✅ | ✅ |
| **Linux** | ✅ | ✅ | ✅ |
| **macOS** | ✅ | ✅ | ✅ |

**How it works:**
1. Artifacts bundle source code (not binaries), so replay compiles on the target platform
2. Portable wrapper scripts in `dummy-project/` handle language-specific compilation
3. Error fingerprints match across platforms (exit codes may differ, but error patterns do not)
4. Environment variables are sanitized to exclude platform-specific paths

**Example:**
```bash
# Capture Java NullPointerException on Windows
$ bugproof capture -- node run-java.js
Artifact: JavaNullPointer.bug

# Replay on Linux with exact fingerprint match
$ bugproof replay JavaNullPointer.bug
✓ REPRODUCTION CONFIRMED (exact fingerprint match)
```

---

## Architecture

BugProof is built for speed and security with zero runtime dependencies (except Commander.js).

```
src/
├── cli.ts                  # CLI Entry & Command definitions
├── capture/                # Capture engine & artifact packager
├── replay/                 # Replay engine & sandbox orchestration
├── diff/                   # Artifact comparison logic
├── sandbox/                # Bug-Box (cgroups/JobObjects) isolation
└── utils/                  # Fingerprinting, Secrets, Git, Security
```

---

## Security & Isolation

- **Secrets Redaction**: Automatic detection and masking of `API_KEY`, `TOKEN`, `PASSWORD`, etc.
- **Environment Sanitization**: Blocklist of dangerous variables (`LD_PRELOAD`, `NODE_OPTIONS`) to prevent hijack.
- **Bug-Box Sandbox**: 
  - **Linux**: cgroups v2 resource limits.
  - **Windows**: Job Objects resource limits.
  - **Filesystem**: `git worktree` isolation to prevent tampering with local source.

---

## Roadmap

- [x] v0.1: CLI core (Capture/Replay/Diff)
- [ ] v0.2: `npm install -g` support & Docker sandbox fallback
- [ ] v0.3: Bug sharing (artifact push/pull)
- [ ] v0.4: Language-specific dependency detection

---

## Contributing

```bash
npm test                # Run test suite (19 suites, 131 tests)
npm run build           # Rebuild TypeScript
npm run test:coverage   # Verify coverage
npm link                # Install locally for development
```

**Test Coverage:**
- ✅ 131 tests passing
- ✅ 19 test suites
- ✅ 80%+ code coverage
- ✅ Cross-platform validation (Windows ↔ Linux)
- ✅ E2E sandbox isolation tests

## Troubleshooting

**"Command not found: bugproof"**
```bash
npm link  # Make sure you've done this after npm install
```

**Windows file association not working**
```powershell
# Run as Administrator
regedit /s scripts/bugproof-file-association-windows.reg
# Then restart File Explorer
```

**Linux .bug files not opening**
```bash
# Re-run the setup script
sudo bash scripts/bugproof-file-association-linux.sh
# Then restart your file manager
```

**Cross-platform replay failing**
- Ensure Git is installed on both machines
- Verify Node.js 18+ on both machines
- Check that source code is available on replay machine
- Run with `--verbose` flag for diagnostics

## Reporting Issues

Found a bug in BugProof itself? Create a `.bug` artifact and open an issue:

```bash
bugproof capture -- npm test  # Capture failing test
# Share the .bug file with us on GitHub
```

## FAQ

**Q: Is the artifact secure?**  
A: Yes. Secrets are automatically redacted before packaging. Run `bugproof inspect` to review contents before sharing.

**Q: Can I share artifacts on Slack/email?**  
A: Yes. `.bug` files are just ZIP archives. They can be shared anywhere.

**Q: Will replay modify my source code?**  
A: No. Sandbox uses `git worktree` isolation. Your working directory stays clean.

**Q: What if the bug requires dependencies?**  
A: BugProof captures `node_modules`, Python venvs, etc. as part of the artifact (with size limits).

**Q: How do I capture intermittent bugs?**  
A: Use `bugproof capture --retries 5 -- yourcommand`. If any run fails, it captures that failure.

---

## Performance

**Capture:** ~100ms overhead per execution  
**Replay:** ~50-200ms depending on sandbox mode and source code size  
**Artifact Size:** Typically 100KB–5MB depending on captured files  
**Compression:** ZIP format, ~70% compression ratio for typical artifacts

---

## Security & Isolation

- **Secrets Redaction**: Automatic detection and masking of `API_KEY`, `TOKEN`, `PASSWORD`, credentials, etc. using 20+ regex patterns
- **Environment Sanitization**: Blocklist of dangerous variables (`LD_PRELOAD`, `NODE_OPTIONS`, `PYTHONPATH`, etc.) to prevent code injection
- **Bug-Box Sandbox**: 
  - **Linux**: cgroups v2 resource limits (CPU, memory, file descriptors)
  - **Windows**: Job Objects resource limits
  - **Filesystem**: `git worktree` isolation to prevent tampering with local source
- **No Execution by Default**: `inspect` command shows artifact contents without running anything

---

## Roadmap

- [x] **v0.1**: CLI core (Capture/Replay/Diff/Inspect)
- [x] **v0.1**: Cross-platform support (Windows ↔ Linux ↔ macOS)
- [x] **v0.1**: Sandbox isolation (cgroups, Job Objects, git worktree)
- [x] **v0.1**: Secret redaction (20+ patterns)
- [ ] **v0.2**: `npm install -g` package & Docker sandbox fallback
- [ ] **v0.2**: Web UI for artifact inspection
- [ ] **v0.3**: Artifact cloud storage (push/pull with signing)
- [ ] **v0.3**: Language-specific dependency detection
- [ ] **v0.4**: GitHub integration (auto-create issues from artifacts)
- [ ] **v0.4**: Diff visualization in web UI

---

## License & Credits

MIT License — see [LICENSE](LICENSE) for details.

**Built by:** Siddharth  
**Repository:** https://github.com/sidinsearch/BugProof  
**Issues:** https://github.com/sidinsearch/BugProof/issues

---

## Getting Help

- 📖 **Docs:** Check the [guides](docs/) directory
- 🐛 **Report a bug:** Create a GitHub issue with `bugproof capture` output
- 💬 **Discuss:** Open a GitHub discussion

---

Made with ❤️ for developers who hate reproducing bugs.


