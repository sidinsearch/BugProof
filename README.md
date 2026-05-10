# BugProof

<div align="center">

<img src="assets/icon-512x512.png" width="200" alt="BugProof Logo">

**Executable bugs, not bug reports.**

Capture a backend or CLI failure into a portable `.bug` artifact that another machine can replay.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-blue)]()
[![Cross-Platform](https://img.shields.io/badge/Cross--Platform-Windows%20%7C%20Linux%20%7C%20macOS-blueviolet)]()

</div>

## What BugProof Captures

A `.bug` artifact includes:
- Source snapshot (git-tracked files, optional untracked)
- Command, arguments, and working directory
- Environment schema (secret values redacted)
- Stdout/stderr and failure fingerprint
- Capture metadata (OS, architecture, commit, branch)

This makes replay deterministic and shareable.

## Install (NPM Package)

```bash
npm install -g bugproof
```

### Install-time checks (automatic)

During installation, BugProof now automatically:
- Verifies Node.js version (requires 18+)
- Checks that Git is available
- Detects optional language toolchains (python/java/gcc/g++/go/rustc)
- Attempts `.bug` file association and icon registration (best effort, user scope)

If association setup fails on your system, run manual scripts:
- Windows: `scripts/bugproof-file-association-windows.reg`
- Linux: `scripts/bugproof-file-association-linux.sh`
- macOS: `scripts/bugproof-file-association-macos.sh`

## Requirements

Required:
- Node.js 18+
- Git

Optional (only needed if your captured command uses them):
- Python / Java / GCC / G++ / Go / Rust toolchains

## Quick Start

### 1) Capture a failure

```bash
bugproof capture -- npm test
```

### 2) Replay it anywhere

```bash
bugproof replay bug_1778049738215.bug
```

### 3) Inspect artifact contents

```bash
bugproof inspect bug_1778049738215.bug
```

### 4) Diff two artifacts

```bash
bugproof diff old.bug new.bug
```

## CLI Help (Lists Everything)

Show full command list and global options:

```bash
bugproof --help
```

Show command-specific help:

```bash
bugproof help capture
bugproof help replay
bugproof help inspect
bugproof help diff
```

You can also use:

```bash
bugproof capture --help
bugproof replay --help
bugproof inspect --help
bugproof diff --help
```

## Commands Reference

### `bugproof capture [command...]`

Capture a command execution as a `.bug` artifact.

Examples:

```bash
bugproof capture -- npm test
bugproof capture -n auth-crash -d "Login fails on expired session" -- node server.js
bugproof capture --include-untracked -- python app.py
bugproof capture -x "*.log" -x "*.tmp" -- go test ./...
bugproof capture --timeout 600000 -- java -cp . Main
bugproof capture --json -- node script.js
```

Options:
- `--include-untracked` Include untracked files (`git ls-files -o`)
- `--skip-secrets` Skip environment secret scan
- `--timeout <ms>` Command timeout in milliseconds (default: `300000`)
- `-n, --name <name>` Human-readable artifact name
- `-d, --description <desc>` Bug description
- `-x, --exclude <pattern>` Exclude files matching pattern (repeatable)
- `--json` Structured JSON output

### `bugproof replay <artifact>`

Replay a `.bug` artifact and compare failure signature.

Examples:

```bash
bugproof replay my-bug.bug
bugproof replay --version-match strict my-bug.bug
bugproof replay --version-match branch my-bug.bug
bugproof replay --sandbox isolated my-bug.bug
bugproof replay --env API_URL=https://staging.local --env DEBUG=true my-bug.bug
bugproof replay --replay-count 5 my-bug.bug
bugproof replay --json my-bug.bug
```

Options:
- `--version-match <mode>` `strict | current | branch` (default: `current`)
- `--sandbox <level>` `workspace | isolated | full` (default: `workspace`)
- `--env <var=value>` Override environment variable (repeatable)
- `--replay-count <n>` Run the replay up to N times (useful for flaky bugs/race conditions)
- `--json` Structured JSON output

### `bugproof inspect <artifact>`

Inspect artifact metadata and failure details without replaying.

Examples:

```bash
bugproof inspect my-bug.bug
bugproof inspect --json my-bug.bug
```

Options:
- `--json` Structured JSON output

### `bugproof diff <left> <right>`

Compare two artifacts side-by-side.

Examples:

```bash
bugproof diff bug-before.bug bug-after.bug
bugproof diff --json bug-before.bug bug-after.bug
```

Options:
- `--json` Structured JSON output

### `bugproof watch [command...]`

Run a command transparently — auto-capture a `.bug` artifact only if it fails. This is the everyday command. Replace `npm test` with `bugproof watch -- npm test` in your workflow.

Examples:

```bash
bugproof watch -- npm test
bugproof watch -- python app.py
bugproof watch -- cargo build
bugproof watch --always -- node script.js   # capture even on success
bugproof watch -o ./bugs -- go test ./...   # output to ./bugs/ directory
```

Options:
- `--timeout <ms>` Command timeout (default: from `.bugproofrc` or 300000)
- `-n, --name <name>` Artifact name
- `-d, --description <desc>` Description
- `-o, --output <dir>` Output directory
- `--always` Capture even when command succeeds
- `--json` Structured JSON output

### `bugproof init`

Create a `.bugproofrc` config file in the current directory.

```bash
bugproof init
bugproof init --force  # overwrite existing
```

Config options (`.bugproofrc`):

```json
{
  "exclude": ["node_modules/**", "dist/**", "*.bug"],
  "outputDir": ".",
  "timeout": 300000,
  "skipSecrets": false,
  "includeUntracked": false,
  "maxArtifactSizeMB": 50,
  "nameTemplate": "bug_{timestamp}"
}
```

Name template variables: `{timestamp}`, `{command}`, `{exit_code}`

### `bugproof share <artifact>`

Share an artifact via GitHub Gist. Creates a secret gist with manifest, failure info, and a README.

```bash
bugproof share my-bug.bug
bugproof share --public my-bug.bug
```

Requires `GITHUB_TOKEN` or `BUGPROOF_GITHUB_TOKEN` env var with `gist` scope. Automatically respects `HTTP_PROXY` and `HTTPS_PROXY` for corporate environments.

Options:
- `--public` Create a public gist (default: secret/unlisted)
- `--json` Structured JSON output

### `bugproof prune`

Clean up orphaned temporary directories and sandbox containers from aborted runs to reclaim disk space.

```bash
bugproof prune
```

### `bugproof doctor`

Run a self-diagnostic to verify host OS support for native sandboxing features (Job Objects, Linux namespaces, Apple Seatbelt).

```bash
bugproof doctor
```

## Smart Features

### Dependency Detection

When capturing, BugProof automatically detects missing dependencies from error output:

```
  Missing Dependencies Detected
    ➜ express (node)
      npm install express
```

Supports: Node.js, Python, Ruby, Go, Rust, system libraries.

### Smart Hints on Replay

When a replay produces a different error than expected, BugProof provides actionable hints:

```
  Hints
    ➜ Missing Node.js module
      Install the missing package: npm install express
    • Network connectivity issue
      A network connection failed. Check that the required service/host is running.
```

## Smart Source Strategy

BugProof intelligently determines how to include source code, keeping artifacts small even for heavy codebases:

| Strategy | Condition | What ships | Artifact size |
|----------|-----------|------------|---------------|
| `git-full` | Clean git repo | Commit hash only | ~2 KB |
| `git-patch` | Dirty git repo | Commit hash + diff patch | ~5 KB |
| `stacktrace` | No git | Only files from error stacktrace | ~10-50 KB |
| `minimal` | No git, no stacktrace | Command only | ~1 KB |

**Git is strongly encouraged but not required.** Without git, BugProof extracts file paths from your error stacktrace and ships only those files — not your entire codebase.

```
  ➜ Source: Git repo dirty at 5b7c1131. Shipping commit ref + diff patch (0.2 KB).
```

## BugBox Container

BugProof includes its own lightweight container sandbox — Docker-like isolation without Docker:

```bash
bugproof replay --container my-bug.bug     # replay with full isolation
bugproof replay --sandbox full my-bug.bug  # alternative: use sandbox layers
```

### Isolation layers per platform

| Layer | Linux | Windows | macOS |
|-------|-------|---------|-------|
| Process isolation | PID namespace (`unshare --pid`) | Job Objects | sandbox-exec |
| Network isolation | Network namespace (`unshare --net`) | Firewall rules (`netsh`) | sandbox-exec deny |
| Filesystem | fuse-overlayfs (read-only source + writable overlay) | Isolated temp | Restricted writes |
| Resource limits | cgroups v2 (memory, CPU, PIDs) | Job Object limits | — |
| Env sanitization | Strip `LD_PRELOAD`, `NODE_OPTIONS`, etc. | Same | Same |
| Temp isolation | Private `/tmp` | Private `%TEMP%` | Private `/tmp` |

Note for Windows: `isolated` and `full` sandbox modes are best-effort hardening, not VM-grade containment. For untrusted artifacts, replay inside a dedicated VM.

No Docker daemon, no images, no 400MB overhead. Just native OS primitives.

## Environment Snapshot

BugProof captures runtime versions at capture time and warns on replay when versions differ:

```
  Environment Mismatches
    • node version mismatch: captured 18.0.0, current 22.1.0
    ✘ python 3.11.0 was available at capture but is not installed now.
```

Tracked runtimes: Node.js, Python, Ruby, Go, Rust, Java, npm, pip, OS platform, architecture.

## File Association and Icon Registration

### Windows

BugProof installer registers `.bug` under:
- `HKCU\\Software\\Classes\\.bug`
- `HKCU\\Software\\Classes\\BugProof.Artifact`

with open command pointing to:
- `node <package>/dist/cli.js replay "%1"`

### Linux

BugProof installer registers:
- MIME type `application/x-bugproof`
- `bugproof.desktop` handler
- User-level icon entry in `~/.local/share/icons/hicolor/...`

### macOS

Installer attempts registration via bundled script. If Finder association does not apply, run:

```bash
bash scripts/bugproof-file-association-macos.sh
```

## Cross-Platform Replay Matrix

| Capture \ Replay | Windows | Linux | macOS |
|---|---|---|---|
| Windows | Yes | Yes | Yes |
| Linux | Yes | Yes | Yes |
| macOS | Yes | Yes | Yes |

Notes:
- **Cross-Architecture Guardrails**: BugProof actively detects and warns on CPU architecture mismatches (e.g., replaying an `x64` bug on an `arm64` machine), advising on Rosetta/translation impacts.
- Exit codes may differ by OS for signals/crashes.
- Fingerprint/error-pattern matching is used for reproduction verdict.

## Design Principles

- Security-first default behavior (secrets redacted by default)
- Language-agnostic command capture (works with any CLI tool)
- Minimal runtime dependencies (Node.js + Git only)
- Reproducibility over screenshots or log snippets

## Development

```bash
npm install
npm run build
npm test
```

## Architecture

BugProof follows a modular pipeline: **Capture → Package → Replay → Verdict**.

| Module | Purpose |
|--------|---------|
| `src/capture/` | Execution capture, environment snapshot, source strategy |
| `src/replay/` | Artifact restore, sandboxing, verdict generation |
| `src/replay/verdict.ts` | Fingerprint and normalized-pattern matching |
| `src/capture/language-support.ts` | Multi-language detection |

Tests use Jest and live under `tests/`. Run `npm test` for the full suite. Cross-platform QA uses `scripts/e2e-matrix.js` with SSH-configured Linux hosts.

## CI/CD

Every push to `main` triggers automated testing across Ubuntu, Windows, and macOS via GitHub Actions. On success, the pipeline auto-bumps the version, publishes to npm, and creates a GitHub Release. The workflow file is at `.github/workflows/ci.yml`.

### One-time setup

1. Generate an npm automation token at https://www.npmjs.com/settings/~/tokens
2. Add it as `NPM_TOKEN` in GitHub: Settings → Secrets and variables → Actions

## License

MIT
