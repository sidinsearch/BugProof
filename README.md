# BugProof

<div align="center">

![BugProof Logo](assets/icon-512x512.png?raw=true&size=200)

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
bugproof capture -e "*.log" -e "*.tmp" -- go test ./...
bugproof capture --timeout 600000 -- java -cp . Main
bugproof capture --json -- node script.js
```

Options:
- `--include-untracked` Include untracked files (`git ls-files -o`)
- `--skip-secrets` Skip environment secret scan
- `--timeout <ms>` Command timeout in milliseconds (default: `300000`)
- `-n, --name <name>` Human-readable artifact name
- `-d, --description <desc>` Bug description
- `-e, --exclude <pattern>` Exclude files matching pattern (repeatable)
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
bugproof replay --json my-bug.bug
```

Options:
- `--version-match <mode>` `strict | current | branch` (default: `current`)
- `--sandbox <level>` `workspace | isolated | full` (default: `workspace`)
- `--env <var=value>` Override environment variable (repeatable)
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
- Exit codes may differ by OS for signals/crashes.
- Fingerprint/error-pattern matching is used for reproduction verdict.

## Legacy Notes (Kept from Old README)

These project principles remain unchanged:
- Security-first default behavior
- Language-agnostic command capture
- Minimal runtime dependencies
- Reproducibility over screenshots/log snippets

## Roadmap

- [x] v0.1: CLI core (capture/replay/inspect/diff)
- [x] v0.1: Cross-platform replay support
- [x] v0.1: Secret redaction and sandbox layers
- [ ] v0.2: npm global install polish and Docker sandbox fallback
- [ ] v0.2: Web UI for artifact inspection
- [ ] v0.3: Artifact push/pull and signing
- [ ] v0.3: Language-specific dependency detection
- [ ] v0.4: GitHub issue integration and richer diff visualization

## Development

```bash
npm install
npm run build
npm test
```

## CI and Releases

- `push` and `pull_request` CI runs only for core paths such as `src/`, `scripts/`, `tests/`, `package.json`, `tsconfig.json`, and `assets/`.
- Docs-only edits like `README.md` do not start the CI workflow.
- Publishing to npmjs.com and GitHub Packages runs only on version tags like `v0.1.0`.

## License

MIT
