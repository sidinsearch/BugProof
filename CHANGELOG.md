# Changelog

All notable changes to BugProof are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and BugProof adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.28] - 2026-05-17 (Terminal UI Polish)

### Fixed

- Removed ASCII art logo from `--help` output; replaced with clean professional text banner.
- Fixed double bug emoji in capture/replay headers.
- Secret detection no longer lists individual key names in output; shows generic warning only.
- Replay now shows command stdout/stderr output before verdict box.
- Summary box table formatting fixed — proper alignment, no truncation issues.
- Postinstall script now shows branded welcome banner with quick start commands.
- Java dummy projects fixed: single quotes replaced with double quotes for valid Java syntax.

---

## [1.1.26] - 2026-05-16 (Comprehensive Validation Release)

### Added

- **`-o/--output` flag on capture** — specify output directory for `.bug` artifacts.
- **`.bugproofrc` config support** — `outputDir` and `nameTemplate` fields control artifact naming and location.
- **`--source-dir` flag on replay** — override source directory for replay execution.
- **Cross-platform translation layer** — automatic PATH separator, path normalization, and command translation (`python` ↔ `python3`) for Win↔Linux replays.
- **`fallbackReason` and `sourceType` fields** in replay results for better diagnostics.
- **Current-dir git detection fallback** — replay engine now detects git repo in current directory when artifact source is missing.
- **AI Agent Skill** — distributable skill package for OpenCode, Claude, Cursor, and OpenClaw agents.
- **MCP server** — 5 tools (`capture`, `replay`, `inspect`, `diff`, `doctor`) with full JSON-RPC support.

### Fixed

- Removed unused `mapToReplayEnvironment` import from `src/replay/sandbox.ts` (lint warning).
- Replay isolation: current directory is never read for source files; sandbox always uses git worktree/clone or artifact's bundled `files/`.
- Artifact path normalization for cross-platform compatibility.

### Verified

- 70/70 validation tests passed across Windows 11 + Ubuntu 22.04
- All 4 cross-platform capture→replay combinations confirmed (Win→Win, Win→Linux, Linux→Win, Linux→Linux)
- MCP server: all 5 tools functional
- Stress tested: 102 files, parallel captures, repeated replays
- Failure injection: 7 scenarios handled gracefully
- 40 test suites, 483 tests, 0 failures

---

## [1.1.25] - 2026-05-16 (Capture Output Control)

### Added

- **`-o/--output` flag** — control where `.bug` artifacts are saved.
- **`.bugproofrc` configuration** — `outputDir` and `nameTemplate` for persistent capture settings.

---

## [1.1.12] - 2026-05-12 (Cross-Platform Validation Complete)

### Added

- **16 dummy projects across 7 languages** - Comprehensive test fixtures for Node.js, Python, Java, C, C++, Go, and Ruby with real-world bug scenarios.
- **58 cross-platform replays with 100% fingerprint match** - Validated deterministic bug reproduction across Windows, Linux, and macOS.
- **Multi-language error context** - Improved detection of language-specific failure patterns.

### Fixed

- Removed unused variable causing lint warning in CI pipeline.

### Verified

- Full cross-platform validation suite passing on Windows 11, Ubuntu 22.04, and macOS
- All 361 tests maintaining stable pass rate with >75% coverage

---

## [1.1.11] - 2026-05-12 (Hardening & UX Improvements)

### Fixed

- Raised hardware resource limit from 50MB to 100MB for replay sandbox to accommodate larger project contexts.
- Improved stacktrace-only source strategy user experience with clearer output messaging.
- Self-heal no longer suggests file paths as npm packages, reducing confusion in dependency auto-install.

### Changed

- Sandbox resource allocation tuned for real-world debugging scenarios.

---

## [1.1.10] - 2026-05-12 (CI/CD Optimization)

### Fixed

- Removed unnecessary escape character in Slack token regex pattern reducing false positives.
- Cleaned up unused `@types/extract-zip` dependency from package manifest.

### Changed

- Streamlined CI/CD workflow for faster build times.

---

## [1.1.9] - 2026-05-12 (Bug Fix Release)

### Fixed

- Corrected self-healing replay logic to properly validate dependency names before installation.
- Fixed path normalization edge cases in replay engine.

### Changed

- Enhanced error messages for better debugging context.

---

## [1.1.8] - 2026-05-11 (Security & Stability)

### Added

- Enhanced package metadata for improved discoverability on npm.

### Fixed

- Stabilized packager test timeout handling for CI environments.

### Removed

- Unnecessary review artifacts from tracked files via `.gitignore` update.

---

## [1.1.6] - 2026-05-11 (Documentation & Branding)

### Changed

- Updated logo source URLs to canonical GitHub CDN endpoints.
- Refreshed README public package metadata for clarity.
- Enhanced License section documentation for AGPL-3.0 use case clarity.

### Fixed

- Logo display consistency across npm package and GitHub repository.

---

## [1.1.5] - 2026-05-11 (Release Stabilization)

### Changed

- Manual version bump to stabilize CI/CD pipeline.
- Cleaned up development documentation and removed outdated instructions.

### Fixed

- Corrected release pipeline trigger conditions.

---

## [1.1.3] - 2026-05-11 (License and Packaging Update)

### Changed

- **License Update**: Switched the open-source license from MIT to **AGPL-3.0**. This strict copyleft stance protects the codebase from proprietary cloud-provider embedding without open-source contributions.
- **GitHub UI Compatibility**: Implemented a specialized parser bypass mechanism in the `LICENSE` file to ensure the GitHub repository correctly displays the tab name "License" while retaining the full AGPL-3.0 legal text.
- **NPM Package**: Simplified `.npmignore` to heavily minimize package size (to 156KB). Ensured the BugProof logo works on NPM via relative paths.

---

## [1.1.2] - 2026-05-11 (Pre-Release Polish)

### Changed

- Updated `prepublishOnly` and `prepare` scripts in package.json for improved release workflow.
- Enhanced packager to properly handle dependency detection across multiple languages.

### Fixed

- Corrected JSON output formatting for CI/CD pipeline compatibility.
- Fixed version bump trigger in release automation.

---

## [1.1.1] - 2026-05-11 (Security Hardening)

### Added

- **Entropy-based secret detection (Phase 2.1)** - `scanEnvironmentForSecrets` now runs a second pass using Shannon entropy analysis after pattern-matching. High-entropy values (>= 4.5 bits/char, length >= 20, predominantly token-safe characters) are flagged regardless of key name. This catches secrets like `MY_APP_CREDENTIAL=<jwt>` that pattern-matching alone would miss.
  - `shannonEntropy(str)` - public export for tooling integration
  - `looksLikeSecret(value)` - multi-gate heuristic (length + char-ratio + path/URL exclusion + entropy gate)
- **12 new tests** covering `shannonEntropy`, `looksLikeSecret`, and the entropy path in `scanEnvironmentForSecrets`. Total test suite: **38 suites, 361 tests passing**.

### Fixed

- Corrected CHANGELOG entry ordering (newest first per Keep a Changelog convention).
- Removed CHANGELOG.md and CONTRIBUTING.md from `.gitignore` (they are real tracked docs, not agent artifacts).
- Rewrote `.npmignore` to correctly exclude all dev/AI tooling while keeping `tsconfig.json` (listed in `package.json` `files`).
- Updated README badge to reflect 361 passing tests.

---

## [1.0.2] - 2026-05-10 (TypeScript Strictness)

### Fixed

- Resolved `@typescript-eslint/no-explicit-any` violations in `src/cli.ts` that broke GitHub Actions CI.
- Uses proper `Awaited<ReturnType<...>>` type inference instead of `any` types for strict mode compliance.

### Changed

- Enhanced CI pipeline compatibility with modern TypeScript strict checks.

---

## [1.0.1] - 2026-05-10 (Platform Test Fixes)

### Fixed

- Fixed cross-platform path mapping in `src/utils/paths.ts` - properly handles Windows absolute paths (D:\path) on Linux CI environments.
- Resolved sandbox temp directory undefined error in `tests/replay/sandbox.test.ts` by gracefully handling git worktree unavailability in CI.
- Fixed tarball filename extraction in e2e matrix test script (`scripts/e2e-matrix.js`) for 100% success on Windows and Linux SSH testing.

### Verified

- All 131 tests passing on both Windows and Linux platforms with exact fingerprint matches.

---

## [1.0.0] - 2026-05-10 (Diamond Solid)

### Added

- **`bugproof doctor`** - Self-diagnostic command verifying host OS support for native sandboxing (Job Objects on Windows, namespaces/cgroups on Linux, sandbox-exec on macOS).
- **`bugproof prune`** - Garbage collection for orphaned BugBox temporary sandbox directories.
- **Flaky Bug Mode (`--replay-count`)** - Pass `--replay-count N` to the `replay` command to automatically retry execution until the failure fingerprint matches.
- **Corporate Proxy Support** - The `share` command routes traffic through `HTTP_PROXY` / `HTTPS_PROXY` via `https-proxy-agent` for enterprise networks.
- **Cross-Architecture Guardrails** - The replay engine detects mismatches between the captured CPU architecture (e.g., `arm64`) and the replay machine (e.g., `x64`) and emits actionable warnings.
- **Terminal UI Polish** - Replaced static logging with animated spinners for capture, extract, and Gist share operations.

### Fixed

- macOS Seatbelt crash: `sandbox-exec` profile now explicitly whitelists the dynamic `containerTmp` folder so Node and Python execute securely without crashing.
- Cross-platform matrix test script (`scripts/e2e-matrix.js`): fixed tarball filename extraction for 100% success on Windows and Linux SSH testing.

---

## [0.2.13] - 2026-05-09 (Node.js 24 Compatibility)

### Changed

- Upgraded GitHub Actions download-artifact@v6→v7 for Node 24 compatibility.
- Refined package dependencies for Node 24 LTS support.

### Fixed

- Resolved Node 24 action compatibility issues.

---

## [0.2.12] - 2026-05-09 (GitHub Actions Modernization)

### Changed

- Upgraded CI/CD actions from @v5 to @v6 for Node 24 native support.
- Removed unused dividerLine and statusBadge utility functions.

### Fixed

- Fixed GitHub Actions deprecation warnings.

---

## [0.2.11] - 2026-05-09 (Cross-Platform Path Normalization)

### Fixed

- `normalizeArtifactPath` now always replaces backslashes, not platform-dependent separators, ensuring consistent artifact format across Windows/Linux/macOS.

### Changed

- Improved path handling consistency in replay engine for cross-platform reliability.

---

## [0.2.10] - 2026-05-08 (Test Coverage Expansion)

### Added

- Replay engine unit tests with comprehensive edge case coverage.
- Replay hints and verdict verdict tests.
- Packager test coverage for non-git capture scenarios.

### Changed

- Raised test coverage thresholds to match improved test suite quality.

### Fixed

- Packager now respects `sourceStrategy.filesToInclude` for non-git captures, ensuring correct artifact composition.

---

## [0.2.9] - 2026-05-08 (GitHub Actions Update)

### Changed

- Upgraded GitHub Actions to use @v5 for checkout, setup-node, and upload-artifact.
- Enhanced CI/CD workflow for better compatibility across platforms.

### Fixed

- Reintroduced `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` flag for compatibility with certain @v5 actions.

---

## [0.2.8] - 2026-05-08 (CI/CD Polish)

### Changed

- Upgraded GitHub Actions to @v5 for improved Node version support.
- Streamlined CI/CD workflow permissions configuration.

### Fixed

- Improved npm publish process for more reliable releases.

---

## [0.2.7] - 2026-05-08 (Node.js & Codecov Upgrade)

### Changed

- Upgraded Node.js version to 24 LTS for production readiness.
- Updated Codecov action to v5 for improved coverage reporting.

### Removed

- Deprecated Node 18 from CI matrix in favor of Node 24 LTS.

---

## [0.2.6] - 2026-05-08 (Dependency Management)

### Changed

- Updated CI workflow to report outdated dependencies without failing the build.
- Improved dependency version checking for proactive maintenance.

---

## [0.2.5] - 2026-05-08 (CI/CD Refinement)

### Changed

- Refined CI/CD workflow permissions for improved security posture.
- Enhanced npm publish process stability.

---

## [0.2.4] - 2026-05-08 (Simplified Test Matrix)

### Changed

- Removed Node version matrix from CI, settling on single LTS version.
- Simplified CI/CD workflow setup steps for faster pipeline execution.

### Fixed

- Improved test reliability by standardizing Node version across CI/CD.

---

## [0.2.3] - 2026-05-08 (Installation Verification)

### Added

- Enhanced CLI installation verification with improved debugging options.
- Multiple execution methods for better cross-platform compatibility.

### Changed

- Improved error handling in post-install verification scripts.
- Better messaging for installation troubleshooting.

---

## [0.2.2] - 2026-05-08 (Multi-Language Support Expansion)

### Added

- Multi-language detection and language-context metadata (Java, C/C++, Go, Rust, .NET, Ruby).
- Cross-platform sandbox translation layer: command/path/env mapping for Windows and Linux replays.
- Multi-language test fixtures with sample applications in C++, C#, Go, Java, Kotlin, Node.js, Python, Ruby, and Rust.
- Comprehensive integration tests for multi-language dependency detection.

### Changed

- Improved source strategy and detection for projects without git (stacktrace / minimal modes).
- Enhanced verdict generation with normalized pattern matching for better bug classification.

### Fixed

- Fixed container cleanup logic for improved sandbox stability.
- Enhanced error handling for better diagnostic messages.

### Verified

- Integration tests for multi-language replay capabilities passing across platforms.

---

## [0.1.2] - 2026-05-07 (Test Suite Cleanup)

### Added

- Comprehensive test suite for capture, source strategy, config loader, CLI, replay hints, sandbox, and dependency detection.

### Changed

- Optimized CI pipeline for faster execution.
- Fixed linting issues for CI compatibility.

### Fixed

- Various test stability improvements.

---

## [0.1.1] - 2026-05-07 (Pre-Release Polish)

### Changed

- Full pre-release polish and packaging optimization.
- Enhanced package manifest for npm distribution.

### Fixed

- Various linting and build improvements.

---

## [0.1.0] - 2026-05-06 (Initial Release - Executable Bug Artifacts)

### Added

- **`bugproof capture`** - Record failing commands with full context (source, environment, output).
- **`bugproof replay`** - Execute captured artifacts with sandbox isolation and fingerprint matching.
- **`bugproof inspect`** - Examine artifact contents without running code.
- **`bugproof diff`** - Compare two artifacts side-by-side.
- **`bugproof share`** - Publish an artifact to GitHub Gist.
- **`bugproof watch`** - Transparent wrapper that captures only on failure.
- **`bugproof init`** - Scaffold a `.bugproofrc` configuration file.
- **Smart source strategy** - `git-full`, `git-patch`, `stacktrace`, `minimal` modes for artifact composition.
- **BugBox sandbox** - Layered isolation: process (Job Objects/cgroups), filesystem (git worktree), network (disabled), resource limits.
- **Secrets redaction** - 20+ regex patterns for detecting and masking API keys, tokens, passwords, AWS credentials.
- **Cross-platform file association** - Setup scripts for Windows (.reg), Linux (.sh), macOS (.sh).

### Verified

- All 131 tests passing
- Full cross-platform support: Windows, Linux, macOS
- Remote validation with exact fingerprint matches for Java, C, and C++ artifacts
- Zero hardcoded secrets in codebase
- Full security audit and threat modeling passed
- AGPL-3.0 licensed and ready for open-source distribution
- Environment snapshot with cross-version diff on replay.
- PII scrubber: emails, IPs, credit cards, GitHub tokens, Stripe keys stripped from captured output.
- Secrets detection: pattern-based env var redaction at capture time.