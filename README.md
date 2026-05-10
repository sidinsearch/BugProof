# BugProof

<div align="center">

<img src="assets/icon-512x512.png" width="160" alt="BugProof Logo">

**Executable bugs, not bug reports.**

Capture a failing command into a portable `.bug` artifact that anyone can replay on their machine — same code, same env, same failure. Cryptographically signable. Cross-platform. Zero containers required.

[![npm version](https://img.shields.io/npm/v/bugproof.svg)](https://www.npmjs.com/package/bugproof)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-blue)](https://nodejs.org/)
[![Cross-Platform](https://img.shields.io/badge/Cross--Platform-Windows%20%7C%20Linux%20%7C%20macOS-blueviolet)]()
[![Tests](https://img.shields.io/badge/tests-349%20passing-brightgreen)]()

</div>

---

## Why BugProof

> "Works on my machine" is not a bug report.

Filing a backend or CLI bug today usually looks like this:
- A screenshot of a terminal
- A copy-pasted stack trace
- A list of *probably* relevant files
- A best-guess description of how the reporter ran the thing

Then the maintainer spends hours reconstructing the failure: matching versions, replicating the env, finding the right command, guessing at config. Most of that time is wasted.

**BugProof captures the bug — not the description of it.** One command produces a single `.bug` file containing the source snapshot, the exact command, the environment schema, the failure fingerprint, and replay metadata. Another developer runs `bugproof replay bug.bug` and reproduces the failure deterministically.

Think of it as **Git for bugs**: a portable, content-addressable, verifiable artifact that turns "can you reproduce?" into a one-liner.

---

## Highlights

- **One-command capture.** Wrap any failing command with `bugproof capture --` and ship the result.
- **Deterministic replay.** Source, env, command, and fingerprint travel together. Verdict is automatic.
- **No Docker. No daemon.** Uses native OS primitives — Linux namespaces, Windows Job Objects, macOS Seatbelt.
- **Cryptographic signatures.** Ed25519 sign/verify built in. Tamper-evident artifacts via `bugproof keygen` / `--sign` / `verify`.
- **Self-healing replay.** `--self-heal` auto-installs missing npm/pip deps in the sandbox and retries.
- **Secrets-safe by default.** Env vars matching known secret patterns are redacted at capture time and re-prompted on replay.
- **Multi-language.** Detects Node.js, Python, Ruby, Go, Rust, Java, C/C++, .NET, Kotlin build context.
- **Cross-platform.** Win ↔ Linux ↔ macOS replay, with command/env translation and architecture-mismatch guardrails.

---

## Install

```bash
npm install -g bugproof
```

Requirements: **Node.js 18+** and **Git**. Optional language toolchains (Python, Java, Go, Rust, …) only required if your captured command needs them.

Run a one-off health check after install:

```bash
bugproof doctor
```

---

## 60-Second Quick Start

```bash
# 1. Reproduce a failure
$ npm test
FAIL  Tests failed because Redis was unreachable.

# 2. Capture it
$ bugproof capture -- npm test
  +  Artifact captured!
  Path        ./bug_1778049738215.bug
  Files       42 files (28.4 KB)
  Fingerprint sha256:c8b3...

# 3. Share the file (Slack, email, gist, attachment...)

# 4. Anyone replays it on their machine
$ bugproof replay bug_1778049738215.bug
  ✔  REPRODUCTION CONFIRMED
  Expected exit  1
  Actual exit    1
  Verdict        Reproduction confirmed (exact fingerprint match)
```

Optional flow:

```bash
$ bugproof inspect bug.bug      # peek at the contents
$ bugproof diff old.bug new.bug # what changed between two captures
$ bugproof share bug.bug        # publish as a GitHub Gist
```

---

## Commands

BugProof ships **12 commands**. Every command supports `--help` and `--json` for machine-readable output.

| Command | Purpose |
|---|---|
| `bugproof capture` | Run a command, record everything, produce a `.bug` artifact |
| `bugproof replay` | Re-execute an artifact, compare against expected fingerprint |
| `bugproof watch` | Transparently wrap a command — capture *only* if it fails |
| `bugproof inspect` | Show artifact contents (manifest, command, fingerprint, files) |
| `bugproof diff` | Side-by-side comparison of two artifacts |
| `bugproof verify` | Validate the Ed25519 signature on a `.bug` (standalone) |
| `bugproof keygen` | Generate an Ed25519 keypair for signing artifacts |
| `bugproof share` | Publish an artifact as a GitHub Gist |
| `bugproof init` | Scaffold a `.bugproofrc` config file |
| `bugproof prune` | Garbage-collect orphan sandbox temp directories |
| `bugproof doctor` | Verify OS support for sandbox isolation features |
| `bugproof help` | Help for any command |

### `bugproof capture [command...]`

Run a command end-to-end and bundle the failure as `<name>.bug`.

```bash
bugproof capture -- npm test
bugproof capture -n auth-crash -d "Login fails on expired session" -- node server.js
bugproof capture --include-untracked -- python app.py
bugproof capture -x "*.log" -x "node_modules/**" -- go test ./...
bugproof capture --timeout 600000 -- java -cp . Main
bugproof capture --sign --signer "alice@example.com" -- ./run.sh
bugproof capture --json -- node script.js
```

Notable options:

| Flag | Description |
|---|---|
| `-n, --name <name>` | Artifact name (becomes `<name>.bug`) |
| `-d, --description <desc>` | Human-readable description embedded in the manifest |
| `-x, --exclude <pattern>` | Exclude files by glob (repeatable) |
| `--include-untracked` | Bundle untracked files too (`git ls-files -o`) |
| `--timeout <ms>` | Kill the command after N ms (default 300000) |
| `--skip-secrets` | Don't scan env for secrets (skip the confirm prompt) |
| `--sign [key]` | Sign with the default key, or a named key under `~/.bugproof/keys/`, or a path to a `.key` file |
| `--signer <id>` | Embed a signer identity (email, gist URL, etc.) |
| `--json` | Structured JSON output |

### `bugproof replay <artifact>`

Re-execute the captured artifact and compare results.

```bash
bugproof replay bug.bug
bugproof replay bug.bug --sandbox isolated
bugproof replay bug.bug --self-heal
bugproof replay bug.bug --verify-signature
bugproof replay bug.bug --replay-count 5         # retry up to 5 times for flaky bugs
bugproof replay bug.bug --env DEBUG=1 --env PORT=3000
```

Notable options:

| Flag | Description |
|---|---|
| `--sandbox <level>` | `workspace` (default), `isolated`, or `full` |
| `--self-heal` | Auto-install missing npm/pip deps and retry (up to 3 rounds) |
| `--verify-signature` | Require a valid Ed25519 signature; exit 2 if missing or invalid |
| `--replay-count <n>` | Retry until reproduction confirmed (for flaky bugs) |
| `--env KEY=VALUE` | Override environment variables (repeatable) |
| `--version-match <mode>` | `current`, `strict`, or `branch` git checkout strategy |
| `--json` | Structured JSON output |

### `bugproof keygen` / `verify` *(cryptographic provenance)*

Sign artifacts with **Ed25519** (RFC 8032). Built on Node's native `crypto` — no external deps.

```bash
# One-time: create your signing key
bugproof keygen
# → writes default.pub / default.key to ~/.bugproof/keys/

# Capture with a signature
bugproof capture --sign --signer "alice@example.com" -- npm test

# Verify a received artifact
bugproof verify bug.bug
  ✔  SIGNATURE VALID
  Algorithm   ed25519
  Fingerprint 179721ef7e63f6b3
  Signed at   2026-05-10T22:09:30Z
  Signer      alice@example.com

# Enforce signatures at replay time
bugproof replay --verify-signature bug.bug
```

The signature covers a canonical hash of the manifest, the failure fingerprint, and the SHA-256 of every file in the bundle. Tampering with the source snapshot, output, exit code, or metadata invalidates the signature.

> **Note:** identity/PKI is intentionally out of scope. Trust is established by comparing the embedded public-key fingerprint against one you trust (gist pinning, team wiki, key servers, etc.).

### `bugproof watch [command...]`

Transparent wrapper. Runs the command normally; only captures if it fails. Drop-in replacement for any command you'd otherwise hand-run.

```bash
bugproof watch -- npm test
bugproof watch -o ./bugs -- python app.py
bugproof watch --always -- node script.js      # capture even on success
```

### `bugproof inspect <artifact>` / `diff <a> <b>`

```bash
bugproof inspect bug.bug                 # manifest, fingerprint, file list, env schema
bugproof diff captured-v1.bug captured-v2.bug
```

### `bugproof share <artifact>`

Publish an artifact as a GitHub Gist. Respects `HTTPS_PROXY` for corporate networks.

```bash
bugproof share bug.bug
bugproof share --public bug.bug
```

Requires `GITHUB_TOKEN` (or `BUGPROOF_GITHUB_TOKEN`) with `gist` scope.

### `bugproof init` / `prune` / `doctor`

```bash
bugproof init        # scaffold .bugproofrc
bugproof prune       # GC orphan sandbox tmpdirs
bugproof doctor      # check OS support for sandbox isolation
```

---

## Configuration (`.bugproofrc`)

Generated by `bugproof init`. All fields optional.

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

`nameTemplate` variables: `{timestamp}`, `{command}`, `{exit_code}`.

---

## Smart Source Strategy

BugProof keeps artifacts small even on heavy codebases:

| Strategy | When it kicks in | What ships | Typical size |
|---|---|---|---|
| `git-full` | Clean git repo | Commit ref only | ~2 KB |
| `git-patch` | Dirty git repo | Commit ref + diff patch | ~5 KB |
| `stacktrace` | No git repo | Files mentioned in the error stacktrace | ~10–50 KB |
| `minimal` | No git, no stacktrace | Command + env only | ~1 KB |

Git is **strongly encouraged** but not required.

---

## Sandbox & Isolation Model

BugProof runs replayed commands in a layered sandbox — Docker-like isolation built on native OS primitives.

| Layer | Linux | Windows | macOS |
|---|---|---|---|
| Process | PID namespace (`unshare --pid`) | Job Objects | sandbox-exec |
| Network | Network namespace (`unshare --net`) | `netsh advfirewall` rules | `(deny network*)` |
| Filesystem | fuse-overlayfs (RO source + writable overlay) | Isolated temp directory | Restricted write paths |
| Resource limits | cgroups v2 (memory, CPU, PIDs) | Job Object limits | — |
| Env sanitization | Strip `LD_PRELOAD`, `NODE_OPTIONS`, … | Same | Same |
| Temp | Private `/tmp` | Private `%TEMP%` | Private `/tmp` |

Three sandbox levels are exposed via `--sandbox`:

- `workspace` *(default)* — minimal isolation, fast. Good for trusted artifacts.
- `isolated` — namespace + temp isolation. Recommended for untrusted artifacts.
- `full` — all layers including network deny + resource limits.

> **Caveat:** On Windows, `isolated` and `full` are best-effort hardening, not VM-grade containment. For artifacts from fully untrusted sources, replay inside a dedicated VM.

---

## Environment Snapshot

Capture-time runtime versions are recorded and diffed on replay:

```
  Environment Mismatches
    •  node version mismatch: captured 18.0.0, current 22.1.0
    ✘  python 3.11.0 was available at capture but is not installed now.
```

Tracked: Node.js, Python, Ruby, Go, Rust, Java, npm, pip, OS platform, architecture.

---

## Cross-Platform Replay

| Capture ↘ / Replay ↗ | Windows | Linux | macOS |
|---|---|---|---|
| **Windows** | ✅ | ✅ | ✅ |
| **Linux** | ✅ | ✅ | ✅ |
| **macOS** | ✅ | ✅ | ✅ |

Translation layer normalizes commands (`python3 ↔ python`, `gradlew ↔ gradlew.bat`, `make ↔ mingw32-make`, shell paths). Architecture mismatches (`x64 ↔ arm64`) trigger explicit warnings with Rosetta/translation advice.

---

## Security Model

- **Secrets:** env vars matching known secret patterns (`*_TOKEN`, `*_KEY`, `*_SECRET`, AWS/GCP/Stripe shapes, etc.) are redacted at capture time and re-prompted on replay. Use `--skip-secrets` only when you've audited the env yourself.
- **Path traversal:** every file copy is validated to stay within the artifact and project boundaries.
- **Script injection:** sandbox commands are spawned with argument arrays, never via shell strings.
- **Provenance:** Ed25519 signatures cover manifest + fingerprint + per-file SHA-256s. Verification runs locally with no network calls.
- **Sandbox env sanitization:** `LD_PRELOAD`, `NODE_OPTIONS`, `DYLD_*`, and similar runtime-hijack vectors are stripped before replay.
- **Cryptography:** Node native `crypto` only (no external crypto deps). No telemetry. No phone-home.

For a full audit checklist see [`docs/security/audit-full.md`](./docs/security/audit-full.md).

---

## File Association

### Windows

Registered under `HKCU\Software\Classes\.bug` → `BugProof.Artifact` with open command `node <package>/dist/cli.js replay "%1"`.

### Linux

Registers MIME `application/x-bugproof`, a `bugproof.desktop` handler, and a user-level icon entry in `~/.local/share/icons/hicolor/`.

### macOS

Best-effort via the bundled script. Re-run manually if Finder association doesn't take:

```bash
bash scripts/bugproof-file-association-macos.sh
```

---

## Architecture

```
bugproof/
├── src/
│   ├── capture/          # Execution + env snapshot + language detection + packaging
│   ├── replay/           # Restore + sandbox orchestration + verdict + self-heal
│   ├── sandbox/          # OS-specific isolation (filesystem, network, process)
│   ├── share/            # Gist publisher
│   ├── diff/             # Two-artifact diff engine
│   ├── utils/            # signing, secrets, fingerprint, dependencies, security, …
│   └── cli.ts            # Commander entrypoint
├── tests/                # 38 suites / 349 tests (Jest)
├── scripts/              # Postinstall, e2e matrix, file-association helpers
└── .github/workflows/    # CI/CD (tri-platform matrix, signed npm publish)
```

Module map:

| Module | Responsibility |
|---|---|
| `capture/engine.ts` | Execute the user's command, record stdout/stderr/exit |
| `capture/packager.ts` | Bundle into `.bug` zip; optionally sign |
| `capture/language-support.ts` | Detect Node/Python/Java/Go/Rust/.NET/C++/Kotlin |
| `replay/engine.ts` | Reproduce the command in a sandbox |
| `replay/self-heal.ts` | Detect missing deps, install, retry |
| `replay/verdict.ts` | Compare fingerprint + normalized error patterns |
| `sandbox/bugbox.ts` | Orchestrate per-OS isolation layers |
| `utils/signing.ts` | Ed25519 sign / verify / canonical-payload builder |
| `utils/secrets.ts` | Pattern-based env scanning + redaction |
| `utils/fingerprint.ts` | Deterministic failure fingerprinting |

---

## Development

```bash
git clone https://github.com/sidinsearch/BugProof.git
cd BugProof
npm install
npm run build
npm test                      # 38 suites, 349 tests
npm run lint
npm run test:e2e              # cross-platform matrix (requires SSH config)
```

CI runs on every push to `main` across Ubuntu, Windows, and macOS; on success the pipeline auto-bumps the patch version, publishes to npm (with `--provenance` on public repos), mirrors to GitHub Packages, and creates a GitHub Release. See `.github/workflows/ci.yml`.

### One-time CI setup

1. Generate an npm automation token at <https://www.npmjs.com/settings/~/tokens>.
2. Add it as `NPM_TOKEN` under repo Settings → Secrets and variables → Actions.

---

## Roadmap

| Status | Item |
|---|---|
| ✅ | Multi-language detection (Phase 1.1) |
| ✅ | Cross-platform sandbox + translation (Phase 1.2) |
| ✅ | BugBox container-free isolation (Phase 1.3) |
| ✅ | Smart source strategy + stacktrace mode (Phase 1.4) |
| ✅ | Corporate proxy support + Gist share (Phase 1.5) |
| ✅ | **Cryptographic signatures (Phase 2.2)** *— v1.1.0* |
| ✅ | **Self-healing replay (Phase 3.1)** *— v1.1.0* |
| ⏳ | Web replay UI (browse `.bug` files in browser) |
| ⏳ | CI plug-ins (auto-attach `.bug` on failed jobs) |
| ⏳ | Multi-signature / co-signing workflows |

---

## Contributing

PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for guidelines, dev setup, and the test matrix expectations. Every PR runs the full tri-platform CI on green; please add tests for new behavior.

---

## License

[MIT](./LICENSE)

---

<div align="center">

**Bug = Runnable Artifact.**

</div>