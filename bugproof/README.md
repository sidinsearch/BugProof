# BugProof

**Executable bug artifacts. Not bug reports.**

BugProof is a CLI tool that captures a failing command into a portable `.bug` artifact
that anyone can run locally to reproduce the issue instantly.

```
Bug = Code + Inputs + Environment + Execution Context
```

No more "works on my machine." No more missing environment variables.
No more incomplete bug reports. Just run `bugproof capture`, share the `.bug` file,
and reproduce the exact same failure on any machine.

```bash
# Capture a failing test
bugproof capture -- npm test

# Share the artifact, then reproduce anywhere
bugproof replay my-bug.bug
# => REPRODUCTION CONFIRMED
```

---

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [capture](#capture)
  - [replay](#replay)
  - [inspect](#inspect)
  - [diff](#diff)
- [Artifact Format](#artifact-format)
- [Security](#security)
- [CI Integration](#ci-integration)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

---

## Install

**Requirements:** Node.js 18+ and Git.

```bash
# Clone the repo
git clone https://github.com/sidinsearch/BugProof.git
cd BugProof/bugproof

# Install dependencies
npm install

# Run directly (development)
npm run cli -- capture -- npm test

# Or build and link globally
npm run build
npm link
bugproof --version
```

---

## Quick Start

### 1. Capture a bug

Run a failing command through BugProof. It records everything needed to reproduce it:

```bash
bugproof capture -- python app.py
```

This creates a `bug_<timestamp>.bug/` directory containing the full reproduction context.

### 2. Share the artifact

Send the `.bug` directory to a teammate. It contains the command, environment schema,
source files, error logs, and a failure fingerprint. Secrets are automatically detected
and redacted.

### 3. Replay the bug

Your teammate runs:

```bash
bugproof replay bug_1714856400000.bug
```

BugProof re-executes the command and compares the failure fingerprint.
If the same error occurs, you get `REPRODUCTION CONFIRMED`.

---

## Commands

### capture

Runs a command, records its failure, snapshots git-tracked source files, and packages
everything into a `.bug` artifact.

```
bugproof capture [options] -- <command...>
```

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Human-readable name for the artifact |
| `-d, --description <desc>` | Description of the bug being captured |
| `-e, --exclude <pattern>` | Exclude files matching a glob pattern (repeatable) |
| `--include-untracked` | Include untracked files (`git ls-files -o`) |
| `--skip-secrets` | Skip secret scanning and confirmation |
| `--timeout <ms>` | Command timeout in milliseconds (default: 300000) |
| `--json` | Output structured JSON for CI pipelines |

**Examples:**

```bash
# Basic capture
bugproof capture -- npm test

# Named artifact with description
bugproof capture -n auth-crash -d "Login fails when session expires" -- node server.js

# Exclude build artifacts and coverage
bugproof capture -e "dist/**" -e "coverage/**" -e "*.map" -- pytest

# JSON output for CI
bugproof capture --json -- cargo test 2>&1 | jq '.fingerprint'
```

**What gets captured:**

- Command and arguments
- Environment variables (secrets auto-redacted)
- Git commit, branch, and dirty state
- All git-tracked source files (with SHA-256 checksums)
- stdout and stderr output
- Exit code, signal, duration
- Error fingerprint and patterns

---

### replay

Opens a `.bug` artifact and re-executes the captured command. Compares the resulting
failure against the original fingerprint and reports whether the bug reproduced.

```
bugproof replay [options] <artifact>
```

| Option | Description |
|--------|-------------|
| `--version-match <mode>` | Git checkout mode: `current`, `strict`, or `branch` (default: `current`) |
| `--env <VAR=value>` | Override environment variables (repeatable) |
| `--json` | Output structured JSON |

**Version match modes:**

| Mode | Behavior |
|------|----------|
| `current` | Run in the current working directory (fast, no sandbox) |
| `strict` | Create a temp directory, checkout the exact git commit from the artifact, run there |
| `branch` | Create a temp directory, checkout the branch tip from the artifact, run there |

The `strict` and `branch` modes use `git worktree` for speed (no network, reuses local
objects). If the commit is unreachable, BugProof falls back to the artifact's file snapshot.

**Examples:**

```bash
# Basic replay (runs in current directory)
bugproof replay my-bug.bug

# Replay at the exact captured commit
bugproof replay --version-match strict my-bug.bug

# Override an environment variable for replay
bugproof replay --env DATABASE_URL=postgres://localhost/test my-bug.bug

# JSON verdict for CI
bugproof replay --json my-bug.bug | jq '.reproduced'
```

**Verdict logic:**

- **Exact fingerprint match** -> `REPRODUCTION CONFIRMED`
- **Shared error patterns** (fuzzy match) -> `REPRODUCTION CONFIRMED`
- **Different error** -> `NOT REPRODUCED` (with details)
- **Command succeeds** -> `NOT REPRODUCED`

Exit code: `0` if reproduced, `1` if not.

---

### inspect

Prints the contents of a `.bug` artifact without executing anything.

```
bugproof inspect [options] <artifact>
```

| Option | Description |
|--------|-------------|
| `--json` | Output structured JSON |

**Example:**

```bash
bugproof inspect auth-crash.bug
```

```
  ┌──────────────────────────────────────┐
  │ 📦 BugProof Inspect                 │
  └──────────────────────────────────────┘
  Manifest
    Name             auth-crash
    Description      Login fails when session expires
    Captured         2026-05-04T18:30:00.000Z
    Command          node server.js
    Platform         linux/x64 (Node v24.14.0)
    Git commit       51cc0b55b21659fe64f7996f9a3477f65c8a438a
    Git branch       main

  Failure
    Exit code        1
    Fingerprint      sha256:a1b2c3d4e5f6...
    Patterns         TypeError, ECONNREFUSED
    Stderr lines     12
```

---

### diff

Compares two `.bug` artifacts side by side. Shows property-level and file-level changes.

```
bugproof diff [options] <left> <right>
```

| Option | Description |
|--------|-------------|
| `--json` | Output structured JSON |

**Example:**

```bash
bugproof diff before-fix.bug after-fix.bug
```

```
  Property Changes
    exit_code
      - 1
      + 0
    fingerprint
      - sha256:a1b2c3d4...
      + sha256:e5f6a7b8...

  File Changes
    + src/auth/session.ts
    ~ src/server.ts

  2 property changes, 2 file changes.
```

Useful for verifying that a fix actually changed the failure mode, or for comparing
the same bug across different environments.

---

## Artifact Format

A `.bug` artifact is a directory with this structure:

```
my-bug.bug/
├── manifest.json       # Name, description, platform, git context, command
├── env.schema.json     # Environment variable classification (required/optional/secrets)
├── run.json            # RunConfig with sanitized environment (secrets = <REDACTED>)
├── failure.json        # Exit code, fingerprint, error patterns, stderr snippet
├── metadata.json       # Capture tool version, platform details, git context
├── files.json          # File manifest with paths, sizes, and SHA-256 checksums
├── files/              # Git-tracked source file snapshot
│   ├── src/
│   ├── package.json
│   └── ...
└── logs/
    ├── stdout.txt      # Full stdout capture
    ├── stderr.txt      # Full stderr capture
    └── fingerprint.json
```

**Size limits:**
- 50 MB hard limit per artifact (configurable via `--exclude`)
- 10 MB warning threshold
- 1 MB per output stream (stdout/stderr)

---

## Security

BugProof is designed to handle untrusted artifacts safely.

### Secrets

- Environment variables matching known patterns (`API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`)
  are automatically detected and redacted in the artifact
- The `env.schema.json` records *which* secrets are needed, not their values
- Use `--skip-secrets` to disable secret scanning

### Artifact Safety

- **Path traversal protection** -- file paths are validated to stay within artifact boundaries
- **Git ref injection prevention** -- branch/commit refs are validated before passing to git
- **Symlink escape protection** -- symlinks in artifact file snapshots are skipped
- **Environment variable sanitization** -- dangerous variables (`PATH`, `LD_PRELOAD`,
  `NODE_OPTIONS`) from artifact environments are stripped during replay
- **No shell execution** -- commands are spawned with `shell: false` to prevent injection
- **Process timeout** -- configurable timeout prevents runaway processes

---

## CI Integration

All commands support `--json` for machine-readable output.

### GitHub Actions Example

```yaml
name: Bug Regression Check
on: pull_request

jobs:
  replay:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run build

      # Replay a known bug artifact to verify it's still fixed
      - name: Verify bug is fixed
        run: |
          RESULT=$(bugproof replay --json known-bugs/auth-crash.bug)
          REPRODUCED=$(echo "$RESULT" | jq -r '.reproduced')
          if [ "$REPRODUCED" = "true" ]; then
            echo "Bug regression detected!"
            exit 1
          fi
```

### JSON Output Shapes

**capture --json:**
```json
{
  "success": true,
  "artifact_path": "/path/to/my-bug.bug",
  "fingerprint": "sha256:...",
  "exit_code": 1,
  "files_count": 42,
  "total_size_bytes": 128000,
  "error_patterns": ["TypeError", "ECONNREFUSED"]
}
```

**replay --json:**
```json
{
  "reproduced": true,
  "verdict": "confirmed",
  "message": "Reproduction confirmed (exact fingerprint match)",
  "expected_exit_code": 1,
  "actual_exit_code": 1,
  "artifact_name": "auth-crash"
}
```

**inspect --json:**
```json
{
  "manifest": { "name": "auth-crash", "command": ["node", "server.js"], "..." : "..." },
  "failure": { "exit_code": 1, "fingerprint": "sha256:...", "..." : "..." },
  "files": [{ "path": "src/server.ts", "size": 2048, "sha256": "..." }]
}
```

---

## Architecture

```
src/
├── cli.ts                  # Command definitions (Commander.js)
├── capture/
│   ├── engine.ts           # Spawns commands, captures output, produces FailureRecord
│   └── packager.ts         # Assembles .bug directory with checksums and sanitized env
├── replay/
│   ├── engine.ts           # Merges env, creates sandbox, re-executes, produces verdict
│   ├── sandbox.ts          # Workspace isolation via git worktree / file snapshot
│   └── verdict.ts          # Fingerprint comparison (exact + fuzzy pattern matching)
├── diff/
│   └── engine.ts           # Property and file-level artifact comparison
├── types/
│   ├── artifact.ts         # ArtifactManifest, RunConfig, EnvSchema, ArtifactMetadata
│   └── failure.ts          # FailureRecord interface
└── utils/
    ├── exclude.ts          # Glob-based file filtering
    ├── fingerprint.ts      # SHA-256 error fingerprinting + pattern extraction
    ├── git.ts              # Git context reader (commit, branch, dirty, remote, tags)
    ├── json-output.ts      # Structured JSON formatters for all commands
    ├── paths.ts            # Cross-platform path normalization
    ├── secrets.ts          # Environment secret scanner + schema builder
    ├── security.ts         # Path traversal, ref injection, env sanitization guards
    └── ui.ts               # ANSI color output, banners, icons
```

**Single runtime dependency:** [Commander.js](https://github.com/tj/commander.js) for CLI parsing.
Everything else uses Node.js built-in modules.

---

## Contributing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run a specific test file
npx jest tests/replay/sandbox.test.ts

# Development mode (auto-recompile)
npm run cli -- capture -- echo "hello"
```

**Test suite:** 12 suites, 67 tests, covering capture, replay, sandbox, diff, secrets,
fingerprinting, exclusion, JSON output, and security validation.

---

## Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| v0.1 | Done | CLI capture, replay, inspect, diff. Secret redaction. Git worktree sandbox. |
| v0.2 | Planned | npm global install. Streaming output to disk. Docker fallback for replay. |
| v0.3 | Planned | Bug sharing (push/pull artifacts). CI regression suite integration. |
| v0.4 | Planned | Language-specific dependency detection (Python, Node, Rust). |

---

## License

MIT
