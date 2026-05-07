## 0.2.2 - 2026-05-08

- Multi-language detection and language-context metadata added (Java, C/C++, Go, Rust, .NET, Ruby).
- Cross-platform sandbox translation layer: command/path/env mapping to improve Windows↔Linux replays.
- Improved source strategy and detection for projects without git (stacktrace/minimal modes).
- Added integration tests and expanded dependency detection across languages.
- Docs: Developer/engineering overview and cross-platform testing guidance.

---

# Changelog

All notable changes to BugProof will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-06

### Added

- **Capture command** — Record failing commands with full context (source code, environment, output)
- **Replay command** — Execute captured bug artifacts with sandbox isolation and fingerprint matching
- **Inspect command** — Examine artifact contents without running code
- **Diff command** — Compare two artifacts side-by-side for changes
- **Cross-platform support** — Capture on Windows, replay on Linux/macOS with exact fingerprint matching
- **Sandbox isolation** — Linux cgroups v2, Windows Job Objects, macOS sandbox-exec isolation
- **Secret redaction** — Automatic detection and masking of 20+ secret patterns (API keys, tokens, passwords)
- **File association** — Post-install registration of `.bug` file type (Windows/Linux/macOS)
- **Install-time checks** — Verify Node.js 18+, Git availability, optional language toolchains
- **JSON output mode** — Structured output for CI/CD integration
- **Environment override** — Custom environment variables during replay
- **Exclude patterns** — Skip files matching patterns during capture
- **Source snapshots** — Bundle git-tracked files with artifacts

### Security

- Path traversal prevention via `isPathWithinBoundary()`
- Git ref injection prevention via `isValidGitRef()`
- Shell injection prevention (no shell: true in spawn calls)
- Environment variable hijacking prevention (LD_PRELOAD, NODE_OPTIONS blocklist)
- Symlink escape prevention in file operations

### Testing

- 19 test suites with 131 passing tests
- 60%+ code coverage across all modules
- Cross-platform validation (Windows ↔ Linux)
- E2E sandbox isolation tests

### Documentation

- Comprehensive README with quick start guide
- CLI help command for discoverability
- Command reference with examples
- File association setup instructions
- Troubleshooting and FAQ sections

## [0.2.0] - 2026-05-07

### Added

- **Watch command** — Run any command with `bugproof watch -- <cmd>` and auto-capture on failure. Transparent pass-through on success. Integrates with `.bugproofrc` config.
- **Init command** — Generate project-level `.bugproofrc` config with `bugproof init`. Supports exclude patterns, timeout, output directory, name templates.
- **Share command** — Push artifacts to GitHub Gist with `bugproof share <artifact>`. Creates a formatted README with replay instructions.
- **Smart Hints** — When replay fails to reproduce, BugProof now suggests actionable fixes (missing packages, env vars, permissions, network issues).
- **Dependency Detection** — Automatically detects missing dependencies from error output across Node.js, Python, Ruby, Go, Rust, and system libraries. Shows install commands.
- **Project Config** — `.bugproofrc` file with hierarchical lookup (walks parent directories). Supports exclude, timeout, name templates, and output directory.
- **Name Templates** — Configurable artifact naming with `{timestamp}`, `{command}`, `{exit_code}` variables.

### Fixed

- Capture no longer crashes in non-git directories (returns empty file list gracefully)
- CLI version now reads dynamically from package.json (no more hardcoded mismatch)
- Flaky test timeout resolved (stderr capture test)

### Testing

- 24 test suites, 182 passing tests
- New test coverage: config loader, dependency detection, smart hints, e2e CLI, packager regression
- End-to-end validation of watch, init, share, and dependency detection workflows

## [0.2.1] - 2026-05-07

### Added

- **Smart Source Strategy** — BugProof now intelligently determines how to include source code:
  - `git-full`: Clean git repo → record commit hash only, zero files shipped (replay uses git checkout)
  - `git-patch`: Dirty git repo → record commit + diff patch (tiny artifact, full reproducibility)
  - `stacktrace`: No git → extract file paths from error stacktrace, ship only those files
  - `minimal`: No git, no stacktrace → command-only artifact
- **BugBox Container** — Lightweight Docker-like isolation without Docker:
  - Linux: user/PID/mount/network namespaces via `unshare`, fuse-overlayfs, cgroups v2
  - Windows: Job Objects + firewall rules + isolated temp
  - macOS: sandbox-exec profiles with filesystem/network deny rules
  - All platforms: temp directory isolation, env sanitization, auto-cleanup
- **Environment Snapshot** — Captures runtime versions (Node, Python, Ruby, Go, Rust, Java, npm, pip) at capture time. On replay, warns about mismatches that could affect reproduction.
- **Replay `--container` flag** — Opt into BugBox container isolation during replay.

### Architecture

- `src/capture/source-strategy.ts` — Smart source inclusion with tiered git/stacktrace/minimal strategies
- `src/capture/env-snapshot.ts` — Runtime version probing and cross-snapshot comparison
- `src/sandbox/container.ts` — Lightweight container with layered isolation (namespace, filesystem, network, resources)
- Packager now writes `source-strategy.json`, `changes.patch`, and `env-snapshot.json` into artifacts

### Testing

- 27 test suites, 204 passing tests
- New coverage: source strategy (5 tests), env snapshot (5 tests), container (6 tests), stacktrace extraction (5 tests)

## [0.3.0] - Planned

- Artifact cloud storage (push/pull with signing)
- GitHub issue integration
- Richer diff visualization

## [0.4.0] - Planned

- Advanced CI/CD integration
- Enterprise features (audit logging, team sharing)
