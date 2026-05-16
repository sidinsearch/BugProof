# BugProof Command Reference

Complete reference for all BugProof commands, flags, and options.

---

## capture

Capture a failing command into a portable `.bug` artifact.

### Usage

```bash
bugproof capture [options] -- <command> [args...]
```

### Required

- `--` — Separator before the command to capture
- Command must follow the separator

### Options

| Flag | Description |
|------|-------------|
| `-n, --name <name>` | Name for the artifact (required) |
| `--skip-secrets` | Skip secrets detection |
| `--include <pattern>` | Include files matching glob pattern |
| `--exclude <pattern>` | Exclude files matching glob pattern |
| `--env-file <path>` | Include specific environment file |
| `--json` | Output in JSON format |
| `--output <path>` | Output path for the artifact |
| `--no-git` | Don't capture git state |
| `--no-env` | Don't capture environment variables |
| `--no-files` | Don't capture file system state |

### Examples

```bash
# Basic capture
bugproof capture -n test-fail -- npm test

# Capture with custom output
bugproof capture -n build-fail --output ./artifacts/ -- go build ./cmd/server

# Capture excluding node_modules
bugproof capture -n app-crash --exclude "node_modules/**" -- node app.js

# Capture with JSON output
bugproof capture -n api-fail --json -- curl http://localhost:3000/api/health
```

---

## replay

Replay a `.bug` artifact to reproduce the failure.

### Usage

```bash
bugproof replay [options] <file.bug>
```

### Options

| Flag | Description |
|------|-------------|
| `--json` | Output in JSON format |
| `--verbose` | Show detailed replay information |
| `--no-sandbox` | Run without sandbox isolation |
| `--timeout <ms>` | Set replay timeout in milliseconds |

### Verdicts

| Verdict | Meaning |
|---------|---------|
| `MATCH` | Failure reproduced exactly |
| `PARTIAL` | Some aspects matched, not all |
| `NO_MATCH` | Failure did not reproduce |

### Examples

```bash
# Basic replay
bugproof replay test-fail.bug

# Replay with verbose output
bugproof replay --verbose test-fail.bug

# Replay with JSON output
bugproof replay --json test-fail.bug
```

---

## diff

Compare two `.bug` artifacts to find differences.

### Usage

```bash
bugproof diff [options] <file1.bug> <file2.bug>
```

### Options

| Flag | Description |
|------|-------------|
| `--json` | Output in JSON format |
| `--verbose` | Show all differences |
| `--summary` | Show only summary of differences |

### Examples

```bash
# Compare two artifacts
bugproof diff before.bug after.bug

# Compare with JSON output
bugproof diff --json before.bug after.bug
```

---

## inspect

Show metadata for a `.bug` artifact without replaying.

### Usage

```bash
bugproof inspect [options] <file.bug>
```

### Options

| Flag | Description |
|------|-------------|
| `--json` | Output in JSON format |
| `--files` | List captured files |
| `--env` | Show captured environment variables |
| `--command` | Show captured command |

### Examples

```bash
# Basic inspect
bugproof inspect test-fail.bug

# Show captured files
bugproof inspect --files test-fail.bug

# Show environment
bugproof inspect --env test-fail.bug
```

---

## doctor

Verify sandbox capabilities and BugProof installation.

### Usage

```bash
bugproof doctor
```

### Output

Shows:
- BugProof version
- Node.js version
- Sandbox capabilities
- File system access
- Network access
- Process execution

---

## verify

Verify a `.bug` artifact's cryptographic signature.

### Usage

```bash
bugproof verify [options] <file.bug>
```

### Options

| Flag | Description |
|------|-------------|
| `--key <path>` | Path to public key |
| `--json` | Output in JSON format |

---

## clean

Clean up old `.bug` artifacts.

### Usage

```bash
bugproof clean [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would be deleted |
| `--older-than <days>` | Only delete artifacts older than N days |
| `--force` | Skip confirmation prompt |

---

## prune

Remove unnecessary files from a `.bug` artifact to reduce size.

### Usage

```bash
bugproof prune [options] <file.bug>
```

### Options

| Flag | Description |
|------|-------------|
| `--aggressive` | Remove more files |
| `--dry-run` | Show what would be removed |

---

## share

Share a `.bug` artifact via URL.

### Usage

```bash
bugproof share [options] <file.bug>
```

### Options

| Flag | Description |
|------|-------------|
| `--json` | Output in JSON format |
| `--expires <hours>` | Set expiration time in hours |

---

## pull

Download a shared `.bug` artifact from a URL.

### Usage

```bash
bugproof pull [options] <url>
```

### Options

| Flag | Description |
|------|-------------|
| `--output <path>` | Output path for the artifact |
| `--json` | Output in JSON format |

---

## watch

Watch for failures and auto-capture them.

### Usage

```bash
bugproof watch [options] <command>
```

### Options

| Flag | Description |
|------|-------------|
| `--name <pattern>` | Name pattern for captured artifacts |
| `--output <dir>` | Output directory for artifacts |

---

## init

Initialize BugProof in a project.

### Usage

```bash
bugproof init [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--force` | Overwrite existing config |
| `--config <path>` | Path to config file |

---

## keygen

Generate cryptographic signing keys.

### Usage

```bash
bugproof keygen [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--output <dir>` | Output directory for keys |
| `--name <name>` | Key name |

---

## mcp

Run BugProof as an MCP server.

### Usage

```bash
bugproof mcp
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `capture` | Run a command and capture its output as a .bug artifact |
| `replay` | Replay a .bug file and return the reproduction verdict |
| `inspect` | Show metadata for a .bug artifact without replaying |
| `diff` | Compare two .bug artifacts to find differences |
| `doctor` | Check if bugproof sandbox capabilities are available |
