# BugProof

> **"Executable bugs, not bug reports."**
>
> Capture a backend/CLI bug into a portable `.bug` artifact that anyone can run locally to reproduce the issue instantly.

```
Bug = Code + Inputs + Environment + Execution Context
```

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Key Features

- 🚀 **Portable bug artifacts** — `.bug` files reproduce bugs exactly, anywhere
- 🛠️ **Instant reproduction** — no "works on my machine" confusion
- 🔒 **Security First** — automatic secret redaction and sandbox isolation
- 🐧🪟 **Cross-Platform** — capture on Windows, replay on Linux (and vice versa)
- 📊 **CI-Ready** — structured JSON output for automated regression checks

---

## Quick Start

### 1. Install

**Requirements:** Node.js 18+ and Git.

```bash
git clone https://github.com/sidinsearch/BugProof.git
cd BugProof
npm install
npm run build
npm link
```

### 2. Capture a bug

Run a failing command through BugProof. It records everything needed to reproduce it:

```bash
bugproof capture -- python app.py
```

### 3. Replay & Verify

Share the `.bug` artifact with anyone. They can reproduce the exact failure instantly:

```bash
bugproof replay my-bug.bug
# => REPRODUCTION CONFIRMED
```

---

## Commands

### `capture`
Runs a command, records its failure, snapshots git-tracked source files, and packages everything into a `.bug` artifact.

```bash
bugproof capture -n auth-crash -d "Login fails when session expires" -- node server.js
```

### `replay`
Opens a `.bug` artifact and re-executes the captured command in an isolated **Bug-Box sandbox**.

```bash
# Replay at the exact captured commit
bugproof replay --version-match strict my-bug.bug
```

### `inspect`
Prints the contents of a `.bug` artifact (manifest, environment schema, failure logs) without execution.

### `diff`
Compares two `.bug` artifacts side by side to show changes in failure patterns or environment.

---

## Architecture

BugProof is built for speed and security with zero runtime dependencies (except Commander.js).

```
src/
├── cli.ts                  # CLI Entry & Command definitions
├── capture/                # Capture engine & artifact packager
├── replay/                 # Replay engine & sandbox orchestration
├── diff/                   # Artifact comparison logic
├── sandbox/                # Bug-Box (cgroups/JobObjects) isolation
└── utils/                  # Fingerprinting, Secrets, Git, Security
```

---

## Security & Isolation

- **Secrets Redaction**: Automatic detection and masking of `API_KEY`, `TOKEN`, `PASSWORD`, etc.
- **Environment Sanitization**: Blocklist of dangerous variables (`LD_PRELOAD`, `NODE_OPTIONS`) to prevent hijack.
- **Bug-Box Sandbox**: 
  - **Linux**: cgroups v2 resource limits.
  - **Windows**: Job Objects resource limits.
  - **Filesystem**: `git worktree` isolation to prevent tampering with local source.

---

## Roadmap

- [x] v0.1: CLI core (Capture/Replay/Diff)
- [ ] v0.2: `npm install -g` support & Docker sandbox fallback
- [ ] v0.3: Bug sharing (artifact push/pull)
- [ ] v0.4: Language-specific dependency detection

---

## Contributing

```bash
npm test                # Run test suite (12 suites, 67 tests)
npm run test:coverage   # Verify 80%+ coverage
```

## License

MIT
