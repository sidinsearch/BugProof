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

## [0.2.0] - Planned

- npm global install polish
- Docker sandbox fallback
- Web UI for artifact inspection
- Language-specific dependency detection

## [0.3.0] - Planned

- Artifact cloud storage (push/pull with signing)
- GitHub issue integration
- Richer diff visualization

## [0.4.0] - Planned

- Advanced CI/CD integration
- Enterprise features (audit logging, team sharing)
