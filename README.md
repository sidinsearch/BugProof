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

## Quick Start

```bash
# 1. Install
npm install -g bugproof

# 2. Capture a failure
bugproof capture -- npm test

# 3. Share the .bug file (Slack, email, gist...)

# 4. Anyone replays it
bugproof replay bug_1778049738215.bug
# → ✔ REPRODUCTION CONFIRMED
```

**Requirements:** Node.js 18+ and Git.

## Why BugProof

> "Works on my machine" is not a bug report.

BugProof captures the bug — not the description of it. One command produces a single `.bug` file containing the source snapshot, the exact command, the environment schema, the failure fingerprint, and replay metadata. Another developer runs `bugproof replay bug.bug` and reproduces the failure deterministically.

Think of it as **Git for bugs**: a portable, content-addressable, verifiable artifact that turns "can you reproduce?" into a one-liner.

## Highlights

- **One-command capture.** Wrap any failing command with `bugproof capture --` and ship the result.
- **Deterministic replay.** Source, env, command, and fingerprint travel together.
- **No Docker. No daemon.** Uses native OS primitives — Linux namespaces, Windows Job Objects, macOS Seatbelt.
- **Cryptographic signatures.** Ed25519 sign/verify built in.
- **Self-healing replay.** `--self-heal` auto-installs missing npm/pip deps and retries.
- **Cross-platform.** Win ↔ Linux ↔ macOS replay with automatic command/env translation.

## Commands

| Command | Purpose |
|---|---|
| `bugproof capture` | Run a command, produce a `.bug` artifact |
| `bugproof replay` | Re-execute an artifact, compare against expected fingerprint |
| `bugproof inspect` | Show artifact contents without running it |
| `bugproof diff` | Compare two artifacts side by side |
| `bugproof watch` | Wrap a command — capture *only* if it fails |
| `bugproof share` | Publish an artifact as a GitHub Gist |
| `bugproof doctor` | Verify OS support for sandbox isolation |
| `bugproof keygen` / `verify` | Ed25519 signing and verification |

## Full Reference

Complete documentation including all command flags, configuration, GitHub Action, MCP server, sandbox model, security, and architecture:

📖 **[docs/REFERENCE.md](./docs/REFERENCE.md)**

## Contributing

PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for guidelines, dev setup, and test expectations.

## License

AGPL-3.0. See [LICENSE](./LICENSE) for details. Commercial licenses available on request.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/sidinsearch">sidinsearch</a>
  &nbsp;·&nbsp;
  Copyright &copy; 2026 <a href="https://github.com/sidinsearch">sidinsearch</a>
</p>
