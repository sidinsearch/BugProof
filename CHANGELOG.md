# Changelog

All notable changes to BugProof are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and BugProof adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.3] - 2026-05-11 (License and Packaging Update)

### Changed
- **License Update**: Switched the open-source license from MIT to **AGPL-3.0**. This strict copyleft stance protects the codebase from proprietary cloud-provider embedding without open-source contributions.
- **GitHub UI Compatibility**: Implemented a specialized parser bypass mechanism in the `LICENSE` file to ensure the GitHub repository correctly displays the tab name "License" while retaining the full AGPL-3.0 legal text.
- **NPM Package**: Simplified `.npmignore` to heavily minimize package size (to 156KB). Ensured the BugProof logo works on NPM via relative paths.

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

## [1.1.0] - 2026-05-11 (Trust + Self-Heal)

### Added

- **Cryptographic signatures (Phase 2.2)** - Sign and verify `.bug` artifacts with Ed25519 (RFC 8032). New commands:
  - `bugproof keygen` - generate an Ed25519 keypair into `~/.bugproof/keys/`
  - `bugproof verify <artifact>` - verify a signature standalone
  - `bugproof capture --sign [key] --signer <id>` - sign a captured artifact
  - `bugproof replay --verify-signature` - require a valid signature before replay

  Signatures cover the canonical hash of manifest + failure fingerprint + per-file SHA-256s, so any tamper of source, output, or metadata invalidates the signature. Zero new runtime dependencies - signing uses Node's native `crypto` Ed25519.

- **Self-healing replay (Phase 3.1)** - `bugproof replay --self-heal` automatically installs missing npm/pip dependencies into the sandbox cwd on failed replay and retries (up to 3 rounds). Only `high`-confidence detections are acted on; dep names are validated against shell metacharacters; installs are scoped to the sandbox working directory.

### Notes

- 16 new signing unit tests + 6 new self-heal orchestration tests. Total: **38 test suites, 349 tests.**

---

## [1.0.0] - 2026-05-11 (Diamond Solid)

### Added

- **`bugproof doctor`** - Self-diagnostic command verifying host OS support for native sandboxing (Job Objects on Windows, namespaces/cgroups on Linux, sandbox-exec on macOS).
- **`bugproof prune`** - Garbage collection for orphaned BugBox temporary sandbox directories.
- **Flaky Bug Mode (`--replay-count`)** - Pass `--replay-count N` to the `replay` command to automatically retry execution until the failure fingerprint matches.
- **Corporate Proxy Support** - The `share` command routes traffic through `HTTP_PROXY` / `HTTPS_PROXY` via `https-proxy-agent` for enterprise networks.
- **Cross-Architecture Guardrails** - The replay engine detects mismatches between the captured CPU architecture (e.g., `arm64`) and the replay machine (e.g., `x64`) and emits actionable warnings.
- **Terminal UI Polish** - Replaced static logging with animated spinners for capture, extract, and Gist share operations.

### Fixed

- macOS Seatbelt crash: `sandbox-exec` profile now explicitly whitelists the dynamic `containerTmp` folder so Node and Python execute securely without crashing.
- Cross-platform matrix test script (`scripts/e2e-matrix.js`): fixed tarball filename extraction, enabling 100% success on Windows and Linux SSH testing.
- Resolved `@typescript-eslint/no-explicit-any` violations in `src/cli.ts` - uses `Awaited<ReturnType<...>>` inference throughout for strict CI compatibility.

---

## [0.2.2] - 2026-05-08

### Added

- Multi-language detection and language-context metadata (Java, C/C++, Go, Rust, .NET, Ruby).
- Cross-platform sandbox translation layer: command/path/env mapping for Windows and Linux replays.
- Improved source strategy and detection for projects without git (stacktrace / minimal modes).
- Integration tests and expanded dependency detection across languages.
- Developer/engineering overview and cross-platform testing documentation.

---

## [0.1.0] - 2026-05-06

### Added

- **`bugproof capture`** - Record failing commands with full context (source, environment, output).
- **`bugproof replay`** - Execute captured artifacts with sandbox isolation and fingerprint matching.
- **`bugproof inspect`** - Examine artifact contents without running code.
- **`bugproof diff`** - Compare two artifacts side-by-side.
- **`bugproof share`** - Publish an artifact to GitHub Gist.
- **`bugproof watch`** - Transparent wrapper that captures only on failure.
- **`bugproof init`** - Scaffold a `.bugproofrc` configuration file.
- Smart source strategy: `git-full`, `git-patch`, `stacktrace`, `minimal`.
- BugBox sandbox with layered isolation: process, filesystem, network, resource limits.
- Environment snapshot with cross-version diff on replay.
- PII scrubber: emails, IPs, credit cards, GitHub tokens, Stripe keys stripped from captured output.
- Secrets detection: pattern-based env var redaction at capture time.