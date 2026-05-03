# BugProof — Executable Bug Artifacts

> **"Executable bugs, not bug reports."**

---

## One-Line Idea

BugProof is a CLI tool that captures a backend/CLI bug into a portable `.bug` artifact that anyone can run locally to reproduce the issue instantly.

---

## Core Positioning

**What BugProof is NOT:**
- A debugger
- A logging or reporting tool
- A UI/session replay system
- A new Docker

**What BugProof IS:**
- A reproducibility layer
- A developer-first CLI tool
- "Git for bugs"

---

## The Problem

Developers constantly face:
- "Works on my machine"
- Missing environment/config
- Incomplete bug reports
- Time wasted reproducing issues

**Current Flow:**
```
User → report → logs → guess → retry → repeat
```
Inefficient. Slow. Unreliable.

---

## Existing Solutions & Why They Fail

| Tool | Category | Why It Fails |
|---|---|---|
| Mozilla rr, WinDbg | Deep Debuggers | Too heavy, low-level, niche |
| Replay.io, LogRocket | Replay Tools | Frontend-focused, not executable |
| Jam.dev, BetterBugs | Bug Reporting | Rich reports but still manual reproduction |
| BugZoo | Container Repro | Closest, but too heavy and not dev-friendly |

**The Gap:**

> No tool provides **simple + lightweight + portable + executable** bug reproduction for backend/CLI.

---

## Core Concept

```
Bug = Code + Inputs + Environment + Execution Context
```

Packaged into:

```
.bug → runnable anywhere
```

---

## How It Works

### 1. Capture

```bash
bugproof capture python app.py
```

Captures:
- Command + args
- Environment (sanitized)
- Required files
- Working directory
- Error output
- Failure fingerprint

---

### 2. Package

```
bug.bug/
├── manifest.json
├── env.schema.json
├── files/
├── run.sh
├── failure.json
└── metadata.json
```

---

### 3. Replay

```bash
bugproof replay bug.bug
```

The engine:
- Validates missing secrets
- Restores files
- Sets environment
- Executes command
- Compares output

---

## Secrets Handling

**Rule: Never store secrets.**

Instead, schema-define them:

```json
{
  "OPENAI_API_KEY": {
    "type": "secret",
    "required": true
  }
}
```

On replay, the tool prompts the user or pulls from local environment.

---

## Smart Error Handling

Failure fingerprint stored at capture time:

```json
{
  "type": "HTTP_401",
  "fingerprint": "auth_failed"
}
```

On replay:
- **Same error** → reproduction confirmed ✅
- **Different error** → hint shown ⚠️

```
Expected: DB timeout
Got:      401 Unauthorized
Hint:     Missing or invalid API key
```

---

## Example Workflow

**Run:**
```bash
python app.py
```

**Error:**
```
ModuleNotFoundError: redis
```

**Capture:**
```bash
bugproof capture python app.py
```

**Share & Replay:**
```bash
bugproof replay bug.bug
```

→ Same bug reproduced instantly, anywhere.

---

## Differentiation

| Capability | Existing Tools | BugProof |
|---|---|---|
| Logs | ✅ | ✅ |
| Replay UI | ✅ | ❌ |
| Debugging | ✅ | ❌ |
| Portable artifact | ❌ | ✅ |
| Local reproduction | ❌ | ✅ |
| CLI-first | ❌ | ✅ |

---

## Architecture

Five core components:

1. **Capture Engine** — intercepts command execution and records context
2. **Packager** — assembles the `.bug` artifact bundle
3. **Replay Engine** — restores context and re-executes
4. **Secrets Manager** — schema-driven secret prompting, never stored
5. **Failure Analyzer** — fingerprints errors and surfaces hints on mismatch

---

## MVP Scope (Strict)

**In scope:**
- Python CLI apps
- Same OS only
- Local filesystem
- Capture command + env (sanitized)
- Snapshot files
- Replay execution

**Out of scope (for now):**
- GUI apps
- Browser support
- Cross-OS reproduction
- Deep debugging

---

## Roadmap

| Phase | Scope |
|---|---|
| Phase 1 | Python + CLI reproduction |
| Phase 2 | Node.js support, better dependency detection |
| Phase 3 | Docker fallback (optional) |
| Phase 4 | CI integration + bug sharing system |

---

## Why It Works

- Solves real daily developer pain
- Simple, explainable concept
- Highly demoable
- Developer-first, open-source friendly
- Low barrier to adoption — just wrap your existing command

---

## Conclusion

BugProof is:
- A new debugging primitive
- A reproducibility layer
- A high-impact open-source project

**Next steps:**
1. Build `bugproof capture`
2. Build `bugproof replay`
3. Iterate fast on real bug cases

---

> You are not building a tool.
> You are redefining how bugs are shared.
>
> **Bug = Runnable Artifact.**