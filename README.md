# BugProof

<div align="center">

<img src="https://raw.githubusercontent.com/sidinsearch/BugProof/main/assets/icon-512x512.png" width="160" alt="BugProof Logo">

**Executable bugs, not bug reports.**

Capture a failing command into a portable `.bug` artifact that anyone can replay on their machine — same code, same env, same failure. Cryptographically signable. Cross-platform. Zero containers required.

[![npm version](https://img.shields.io/npm/v/bugproof.svg)](https://www.npmjs.com/package/bugproof)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-blue)](https://nodejs.org/)
[![Cross-Platform](https://img.shields.io/badge/Cross--Platform-Windows%20%7C%20Linux%20%7C%20macOS-blueviolet)]()

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
- **Best-effort credential redaction.** Env vars are scanned via pattern-matching + Shannon entropy. Known secret shapes (API keys, tokens, JWTs) are caught; low-entropy passwords and binary credentials may still leak.
- **Multi-language.** Detects Node.js, Python, Ruby, Go, Rust, Java, C/C++, .NET, Kotlin build context automatically.
- **Cross-platform.** Win ↔ Linux ↔ macOS replay, with command/env translation and architecture-mismatch guardrails.

---

## Install

```bash
npm install -g bugproof
```

**Requirements:** Node.js 18+ and Git. Optional language toolchains (Python, Java, Go, Rust, …) are only needed if your captured command uses them.

Run a one-off health check after install:

```bash
bugproof doctor
```

---

## GitHub Action — Capture CI Failures Automatically

Add a single step to any GitHub Actions workflow to auto-capture flaky/failing commands as `.bug` artifacts.

```yaml
- name: Capture flaky test
  uses: sidinsearch/BugProof/.github/actions/bugproof-action@main
  with:
    command: 'npm test -- --run flaky-suite'
    name: flaky-test-failure
    timeout: 300000
```

**How it works**: The action installs `bugproof` from **npmjs.org** (`npm install -g bugproof`) → wraps your command with `bugproof capture` → on failure, the `.bug` artifact is uploaded to the Actions run. Developers download and repro locally with `bugproof replay`.

**Use cases**:
- **Flaky CI tests**: Capture the exact failure for local debugging
- **Cross-platform failures**: A test passes on Linux CI but fails on macOS — capture the failure on both and diff
- **Intermittent crashes**: `bugproof capture -- node app.js` bundles the crash state, env, and source

**All inputs**:

| Input | Required | Default | Description |
|---|---|---|---|
| `command` | ✅ | — | Command to capture (e.g. `npm test`) |
| `name` | — | `bug_<timestamp>` | Artifact name |
| `timeout` | — | `300000` | Command timeout in ms |
| `skip-secrets` | — | `false` | Skip env secret scanning |
| `upload-artifact` | — | `true` | Upload .bug file as Actions artifact |
| `node-version` | — | `24` | Node.js version for bugproof |

The action lives at `.github/actions/bugproof-action/action.yml` in this repo. Reference it via `uses: sidinsearch/BugProof/.github/actions/bugproof-action@main`. BugProof is always installed from npmjs.org — no GitHub Packages token needed.

---

## MCP Server — AI-Agent Integration

BugProof ships a built-in **MCP (Model Context Protocol) server** that exposes capture, replay, inspect, and diff as tools any MCP-compatible host can call. Listed on the [Official MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.sidinsearch/bugproof`.

### Setup

#### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "bugproof": {
      "command": "npx",
      "args": ["-y", "bugproof", "mcp"]
    }
  }
}
```

#### Cursor

Add to Cursor MCP config (Settings → Features → MCP):

```json
{
  "mcpServers": {
    "bugproof": {
      "command": "npx",
      "args": ["-y", "bugproof", "mcp"]
    }
  }
}
```

#### Continue.dev

Add to `~/.continue/config.json`:

```json
{
  "experimental": {
    "mcpServers": {
      "bugproof": {
        "command": "npx",
        "args": ["-y", "bugproof", "mcp"]
      }
    }
  }
}
```

#### With bugproof installed globally

If you already have bugproof globally (`npm install -g bugproof`), omit `npx -y`:

```json
{
  "mcpServers": {
    "bugproof": {
      "command": "bugproof",
      "args": ["mcp"]
    }
  }
}
```

**No separate MCP install needed.** `npx -y bugproof mcp` auto-downloads from npmjs.org and starts the server over stdio.

### Tools

| Tool | Description | When an AI agent would use it |
|---|---|---|
| `capture` | Run a command, capture as .bug artifact | "Capture this failing test and tell me what changed" |
| `replay` | Replay a .bug file, return verdict | "Replay the artifact from CI and confirm it still fails" |
| `inspect` | Show artifact metadata | "What's in this .bug file without running it?" |
| `diff` | Compare two artifacts | "Compare the CI capture with my local capture — what's different?" |
| `doctor` | Check sandbox capabilities | "Does this machine support full sandbox isolation?" |

### Example AI session

```
User:   Capture the failing test and tell me what went wrong
Agent:  [calls bugproof capture -- npm test -- --run flaky-suite]
        [calls bugproof inspect on the result]
        "The test failed with a timeout. Fingerprint matches a known
         Redis-unreachable pattern. Here's the captured stderr..."
```

The MCP server communicates over **stdio** (JSON-RPC 2.0). It shells out to the local `bugproof` CLI with `--json` output and returns structured results. If bugproof isn't installed, `npx -y` fetches it from npmjs.org — no global install required.

---

## 60-Second Quick Start

```bash
# 1. Reproduce a failure
$ npm test
FAIL  Tests failed because Redis was unreachable.

# 2. Capture it
$ bugproof capture -- npm test
  ✔  Artifact captured!
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
$ bugproof inspect bug.bug        # peek at the contents
$ bugproof diff old.bug new.bug   # what changed between two captures
$ bugproof share bug.bug          # publish as a GitHub Gist
```
 

## Commands

BugProof ships **14 commands**. Every command supports `--help` and `--json` for machine-readable output.

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
| `bugproof mcp` | Start the MCP server for AI-agent integration |
| `bugproof init` | Scaffold a `.bugproofrc` config file |
| `bugproof prune` | Garbage-collect orphan sandbox temp directories |
| `bugproof clean` | Remove all `.bug` artifacts from the current directory |
| `bugproof pull` | Download a shared `.bug` artifact from a GitHub Gist |
| `bugproof doctor` | Verify OS support for sandbox isolation features |
| `bugproof help` | Help for any command |

---

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

| Flag | Description |
|---|---|
| `-n, --name <name>` | Artifact name (becomes `<name>.bug`) |
| `-d, --description <desc>` | Human-readable description embedded in the manifest |
| `-x, --exclude <pattern>` | Exclude files by glob (repeatable) |
| `--include-untracked` | Bundle untracked files too (`git ls-files -o`) |
| `--timeout <ms>` | Kill the command after N ms (default 300000) |
| `--skip-secrets` | Don't scan env for secrets (skip the confirm prompt) |
| `--sign [key]` | Sign with the default key, or a named key / path to a `.key` file |
| `--signer <id>` | Embed a signer identity (email, gist URL, etc.) |
| `--json` | Structured JSON output |

---

### `bugproof replay <artifact>`

Re-execute the captured artifact and compare results.

```bash
bugproof replay bug.bug
bugproof replay bug.bug --sandbox isolated
bugproof replay bug.bug --self-heal
bugproof replay bug.bug --verify-signature
bugproof replay bug.bug --json
```

| Flag | Description |
|---|---|
| `--sandbox <level>` | `workspace` (default), `isolated`, or `full` |
| `--self-heal` | Auto-install missing npm/pip deps and retry (up to 3 rounds) |
| `--verify-signature` | Require a valid Ed25519 signature; exit 2 if missing or invalid |
| `--json` | Structured JSON output |

---

### `bugproof keygen` / `verify` — Cryptographic Provenance

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

The signature covers a canonical hash of the manifest, the failure fingerprint, and the SHA-256 of every file in the bundle. Tampering with source, output, exit code, or metadata invalidates the signature.

> **Note:** identity/PKI is intentionally out of scope. Trust is established by comparing the embedded public-key fingerprint against one you know (gist pinning, team wiki, key server, etc.).

---

### `bugproof watch [command...]`

Transparent wrapper. Runs the command normally; only captures if it fails. Drop-in replacement for any command you'd otherwise hand-run.

```bash
bugproof watch -- npm test
bugproof watch -o ./bugs -- python app.py
bugproof watch --always -- node script.js    # capture even on success
```

---

### `bugproof inspect <artifact>` / `diff <a> <b>`

```bash
bugproof inspect bug.bug                          # manifest, fingerprint, file list, env schema
bugproof diff captured-v1.bug captured-v2.bug     # what changed between two captures
```

---

### `bugproof share <artifact>`

Publish an artifact as a GitHub Gist. Respects `HTTPS_PROXY` / `HTTP_PROXY` for corporate networks.

```bash
bugproof share bug.bug
bugproof share --public bug.bug
```

Requires `GITHUB_TOKEN` (or `BUGPROOF_GITHUB_TOKEN`) with `gist` scope.

---

### `bugproof init` / `prune` / `doctor`

```bash
bugproof init       # scaffold .bugproofrc in the current directory
bugproof prune      # garbage-collect orphan BugBox temp directories
bugproof doctor     # check OS support for sandbox isolation (namespaces, Job Objects, Seatbelt)
```

---

## Configuration (`.bugproofrc`)

Generated by `bugproof init`. All fields are optional.

```json
{
  "exclude": ["node_modules/**", "dist/**", "*.bug"],
  "outputDir": ".",
  "timeout": 300000,
  "skipSecrets": false,
  "includeUntracked": false
}
```

---

## Smart Source Strategy

BugProof keeps artifacts small even on heavy codebases:

| Strategy | When | What ships | Typical size |
|---|---|---|---|
| `git-full` | Clean git repo | Commit ref only | ~2 KB |
| `git-patch` | Dirty git repo | Commit ref + diff patch | ~5 KB |
| `stacktrace` | No git repo | Files mentioned in the stacktrace | ~10–50 KB |
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

The translation layer normalizes commands (`python3 ↔ python`, `gradlew ↔ gradlew.bat`, `make ↔ mingw32-make`, shell paths). Architecture mismatches (`x64 ↔ arm64`) trigger explicit warnings with Rosetta/translation advice.

---

## Security Model

| Area | Mechanism |
|---|---|
| **Secrets — known patterns** | Env vars matching `*_TOKEN`, `*_KEY`, `*_SECRET`, AWS/GCP/Stripe shapes are redacted at capture |
| **Secrets — unknown values** | Shannon entropy analysis flags high-entropy values (≥4.5 bits/char) even with innocuous key names |
| **stdout/stderr scrubbing** | Active regex stream-scrubber strips emails, IPs, credit cards, GitHub tokens, Stripe keys from captured output |
| **Path traversal** | Every file copy is validated to stay within artifact and project boundaries |
| **Script injection** | Sandbox commands are spawned with argument arrays — never via shell strings |
| **Provenance** | Ed25519 signatures cover manifest + fingerprint + per-file SHA-256s. Verification is local, no network calls |
| **Sandbox env sanitization** | `LD_PRELOAD`, `NODE_OPTIONS`, `DYLD_*`, and similar runtime-hijack vectors are stripped before replay |
| **Cryptography** | Node native `crypto` only — no external crypto deps. No telemetry. No phone-home |

Use `--skip-secrets` only when you've audited the environment yourself.

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
│   ├── config/           # .bugproofrc loader and validation
│   ├── utils/            # signing, secrets, fingerprint, dependencies, security, …
│   └── cli.ts            # Commander entrypoint (14 commands)
├── tests/                # 40 suites / 483 tests (Jest)
├── scripts/              # Postinstall, e2e matrix, file-association helpers
└── .github/workflows/    # CI/CD (tri-platform matrix, signed npm publish)
```

| Module | Responsibility |
|---|---|
| `capture/engine.ts` | Execute the user's command, stream output to temp files, record stdout/stderr/exit |
| `capture/packager.ts` | Bundle into `.bug` zip; optionally sign with Ed25519 |
| `capture/language-support.ts` | Detect Node/Python/Java/Go/Rust/.NET/C++/Kotlin |
| `capture/env-snapshot.ts` | Record runtime versions for environment diff on replay |
| `capture/source-strategy.ts` | Smart source selection: git-full, git-patch, stacktrace, minimal |
| `replay/engine.ts` | Reproduce the command in a sandbox |
| `replay/self-heal.ts` | Detect missing deps, install in sandbox, retry |
| `replay/verdict.ts` | Compare fingerprint + normalized error patterns |
| `replay/hints.ts` | Generate actionable debugging hints from captured output |
| `sandbox/bugbox.ts` | Orchestrate per-OS isolation layers |
| `sandbox/cross-platform.ts` | Command translation across Windows/Linux/macOS |
| `utils/signing.ts` | Ed25519 sign / verify / canonical-payload builder |
| `utils/secrets.ts` | Pattern + entropy-based env scanning, PII stream scrubber |
| `utils/fingerprint.ts` | Deterministic failure fingerprinting, path normalization |
| `utils/dependencies.ts` | Detect missing npm/pip/system deps from stderr |
| `utils/ui.ts` | Terminal UI: colors, spinners, progress bars, summary boxes |
| `diff/engine.ts` | Side-by-side artifact comparison |
| `share/gist.ts` | GitHub Gist publisher with proxy support |
| `config/loader.ts` | Load and validate `.bugproofrc` configuration |

---



## Contributing

PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for guidelines, dev setup, and the test matrix expectations. Every PR runs the full tri-platform CI; please add tests for new behavior.

---

## License

This project is licensed under the **[GNU Affero General Public License v3.0](LICENSE)** (AGPL-3.0).

| Use Case | Allowed? |
|---|---|
| Personal & non-commercial use | ✅ Free, no restrictions |
| Forking & modifications | ✅ Must release under AGPL-3.0 with source code |
| Running as a network service (SaaS) | ✅ Must publish your modified source code |
| Commercial / proprietary use | ❌ Requires a separate commercial license |


---

<p align="center">
  Made with ❤️ by <a href="https://github.com/sidinsearch">sidinsearch</a>
  &nbsp;·&nbsp;
  Copyright &copy; 2026 <a href="https://github.com/sidinsearch">sidinsearch</a>
  &nbsp;·&nbsp;
  <a href="LICENSE">AGPL-3.0 License</a>
</p>
