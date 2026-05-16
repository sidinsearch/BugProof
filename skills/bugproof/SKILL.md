---
name: bugproof
description: Capture, replay, and debug failures with portable executable .bug artifacts. Use when debugging failures, reproducing bugs, sharing bug reports, or comparing failures across environments. Supports capture, replay, diff, inspect, doctor, verify, clean, prune, share, pull, watch, init, keygen, and mcp commands.
when_to_use: User reports a bug, wants to reproduce a failure, needs to share a bug artifact, asks about BugProof commands, or mentions "works on my machine", ".bug file", "capture this", "replay the bug", "executable bug".
license: AGPL-3.0
---

# BugProof — Executable Bug Artifacts

Capture failing commands into portable `.bug` artifacts that anyone can replay — same code, same environment, same failure. Cross-platform. Zero containers required.

**Install:** `npm install -g bugproof`
**Repository:** https://github.com/sidinsearch/BugProof

---

## Core Commands

```bash
bugproof capture -n <name> -- <command>     # Capture failure
bugproof replay <file.bug>                   # Reproduce failure
bugproof diff <a.bug> <b.bug>               # Compare artifacts
bugproof inspect <file.bug>                  # View metadata
bugproof doctor                              # Check capabilities
```

## Full Command Set

| Command | Purpose |
|---------|---------|
| `capture` | Capture failing command into .bug artifact |
| `replay` | Replay .bug artifact to reproduce failure |
| `diff` | Compare two .bug artifacts |
| `inspect` | Show .bug metadata without replaying |
| `doctor` | Verify sandbox capabilities |
| `verify` | Verify artifact cryptographic signature |
| `clean` | Clean up old .bug artifacts |
| `prune` | Remove unnecessary files from .bug |
| `share` | Share .bug artifact via URL |
| `pull` | Download shared .bug artifact |
| `watch` | Watch for failures and auto-capture |
| `init` | Initialize BugProof in a project |
| `keygen` | Generate signing keys |
| `mcp` | Run as MCP server |

---

## Capture Workflow

### Basic Capture

```bash
bugproof capture -n my-bug -- <failing-command>
```

### Key Flags

| Flag | Purpose |
|------|---------|
| `-n <name>` | Artifact name (default: `bug_<timestamp>`) |
| `-o <dir>` | Output directory (default: current directory; respects `.bugproofrc` `outputDir`) |
| `--skip-secrets` | Skip secrets detection (faster) |
| `--include <pattern>` | Include files (glob pattern) |
| `--exclude <pattern>` | Exclude files from capture |
| `--env-file <path>` | Include specific env file |
| `--json` | Output in JSON format |

### Where Artifacts Are Saved

- **Default:** Current working directory (`process.cwd()`)
- **With `-o`:** Specified directory (created if needed)
- **With `.bugproofrc`:** Respects `outputDir` config field
- **Default name:** `bug_<timestamp>.bug` (e.g., `bug_1747382901234.bug`)
- **Custom name:** `<name>.bug` (e.g., `auth-crash.bug`)

### What Gets Captured

- Command and arguments
- Working directory
- Environment variables
- File system state (git-tracked files)
- Language runtime versions
- Dependencies

### Verify Capture

```bash
bugproof inspect my-bug.bug
bugproof doctor
```

---

## Replay Workflow

```bash
bugproof replay <file.bug>
bugproof replay <file.bug> --source-dir .   # Use current dir's git repo
```

### Verdicts

| Verdict | Meaning |
|---------|---------|
| `MATCH` | Failure reproduced exactly |
| `PARTIAL` | Some aspects matched |
| `NO_MATCH` | Failure did not reproduce |

### Replay Isolation

Replay always runs in an isolated temp directory. Files come from:
1. **Git worktree/clone** at the captured commit (if original path accessible)
2. **Current directory's git repo** (fallback if original path gone)
3. **Artifact's bundled `files/`** (final fallback)

The current directory is **never read** for source files during replay.

### If NO_MATCH

1. `bugproof inspect` — Check environment differences
2. `bugproof diff` — Compare captures
3. Check runtime versions and dependencies
4. Use `--source-dir .` if original path is inaccessible

---

## Cross-Platform Replay

BugProof supports deterministic replay across Windows, Linux, and macOS:

1. Capture on any OS → `.bug` artifact is portable
2. Transfer the `.bug` file
3. Replay on target OS

Normalized fingerprints enable cross-platform comparison. Same bug captured on Windows and replayed on Linux produces `MATCH` if failure is platform-independent.

---

## Diff Workflow

```bash
# Before/after fix
bugproof diff before-fix.bug after-fix.bug

# Cross-platform comparison
bugproof diff windows.bug linux.bug
```

Shows: environment differences, file state changes, output diffs, exit codes.

---

## Common Workflows

### Report a Bug

```bash
bugproof capture -n bug-report -- <failing-command>
bugproof inspect bug-report.bug
bugproof share bug-report.bug
```

### Verify a Fix

```bash
bugproof capture -n before -- <command>
# apply fix
bugproof capture -n after -- <command>
bugproof diff before.bug after.bug
bugproof replay after.bug
```

### CI/CD Integration

```bash
# In CI pipeline
bugproof capture -n ci-failure -- npm test || true
# Download and replay locally
bugproof replay ci-failure.bug
```

---

## MCP Server

BugProof runs as an MCP server for AI agent integration:

```bash
bugproof mcp
```

**MCP Tools:** `capture`, `replay`, `inspect`, `diff`, `doctor`

**MCP Config:**
```json
{
  "mcpServers": {
    "bugproof": {
      "command": "npx",
      "args": ["bugproof", "mcp"]
    }
  }
}
```

---

## Best Practices

- **Naming:** Use `component-failure-date` (e.g., `auth-test-fail-2026-05-16`)
- **Include:** Config files, logs with `--include`
- **Exclude:** Large directories with `--exclude "node_modules/**"`
- **Security:** Review artifacts before sharing, use `--skip-secrets` carefully
- **Size:** Use `bugproof prune` to reduce artifact size

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Replay "Command Not Found" | Install missing runtime, check `bugproof inspect` |
| `NO_MATCH` verdict | Use `bugproof diff` to find differences |
| Capture too slow | Use `--skip-secrets`, `--exclude` |
| Artifact too large | Use `bugproof prune`, exclude large directories |

---

## Requirements

- Node.js 18+
- npm or yarn
- Git (for file capture)

---

## Additional Resources

- **Full Command Reference:** [reference/commands.md](reference/commands.md)
- **Usage Examples:** [examples/usage-examples.md](examples/usage-examples.md)
- **GitHub Repository:** https://github.com/sidinsearch/BugProof
- **npm Package:** https://www.npmjs.com/package/bugproof
