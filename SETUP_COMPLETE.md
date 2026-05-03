# SETUP_COMPLETE.md

## 🎉 BugProof Project Setup Complete!

Your BugProof project is now fully configured for AI-assisted development across multiple platforms with persistent context and memory.

---

## What Was Set Up

## Setup Scripts

- **File:** `.gstack/setup.sh` (macOS/Linux)
- **File:** `.gstack/setup.bat` (Windows)
- **File:** `.gstack/setup-all-platforms.sh` (macOS/Linux)
- **File:** `.gstack/setup-all-platforms.bat` (Windows)
- **Purpose:** Installs gstack for all AI coding platforms you have installed

Supported platforms:
- Claude Code (primary)
- OpenCode
- Cursor
- Antigravity
- OpenClaw

### ✅ 2. Context Preservation & Memory

- **File:** `docs/CONTEXT_MEMORY.md`
- **Configuration:** `.gstack/.env.example` (copy to `.env`)
- **Purpose:** Seamless context switching between platforms

Three methods:
1. **GBrain** (recommended) — cloud or local persistent knowledge
2. **Checkpoint mode** — local git commits with context
3. **Manual context files** — update `.claude/context/active-decisions.md`

### ✅ 3. gstack Integration

- **File:** `CLAUDE.md` — Complete gstack documentation for your project
- **File:** `.gstack/setup.sh` / `.gstack/setup.bat` — Quick start guide
- **File:** `.gstack/setup-mcp-servers.sh` — MCP server registration

32 available skills:
- Planning: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/plan-devex-review`
- Building: `/design-consultation`, `/design-shotgun`, `/design-html`
- Reviewing: `/review`, `/codex`, `/design-review`, `/devex-review`
- Testing: `/qa`, `/qa-only`, `/cso`, `/benchmark`
- Shipping: `/ship`, `/land-and-deploy`, `/canary`
- Debugging: `/investigate`, `/browse`, `/learn`, `/retro`
- Utils: `/careful`, `/freeze`, `/guard`, `/gstack-upgrade`, `/setup-gbrain`

### ✅ 4. Project Configuration

- **File:** `CONTRIBUTING.md` — Development workflow guide
- **File:** `README.md` — Project overview
- **File:** `Idea.md` — Product vision (from your original file)
- **File:** `package.json` — Node.js project setup
- **File:** `tsconfig.json` — TypeScript configuration
- **File:** `jest.config.js` — Testing framework
- **File:** `.prettierrc` — Code formatting
- **File:** `.eslintrc` — Linting rules
- **File:** `.gitignore` — Git exclusions

### ✅ 5. MCP Server Support

- **File:** `setup-mcp-servers.sh`
- **Purpose:** Register GBrain as MCP server for Claude Code
- **Provides:** `gbrain search` and `gbrain put_page` tools

---

## Quick Start Instructions

### For macOS/Linux:

```bash
cd d:\BugProof
./.gstack/setup.sh
```

### For Windows:

```bash
cd d:\BugProof
.\.gstack\setup.bat
```

Or manually:

```bash
# 1. Install gstack for all platforms
./.gstack/setup-all-platforms.sh   # macOS/Linux
.\.gstack\setup-all-platforms.bat  # Windows

# 2. Set up GBrain (in your AI platform)
/setup-gbrain

# 3. Start planning
/office-hours
```

---

## First Time Using BugProof + gstack

### Step 1: Install (one-time)

```bash
./.gstack/setup.sh              # macOS/Linux
# or
.\.gstack\setup.bat             # Windows
```

### Step 2: Initialize GBrain (recommended, one-time)

In your AI platform (Claude Code, OpenCode, etc.):

```bash
/setup-gbrain
```

Choose:
- **PGLite local** — single machine, no network, ~30 seconds
- **Supabase existing** — team collaboration, persistent
- **Supabase auto-provision** — auto-create Supabase project

### Step 3: Plan your first feature

```bash
/office-hours
```

The skill will:
- Ask 6 forcing questions about what you want to build
- Push back on your assumptions
- Generate 3 implementation approaches
- Create a design document

### Step 4: Lock architecture

```bash
/plan-eng-review
```

The skill will:
- Generate ASCII diagrams for data flow
- Define state machines and error paths
- Create test matrix and failure modes
- Check for security concerns

### Step 5: Implement

Follow the plan. Commit frequently.

### Step 6: Review

```bash
/review
```

The skill will:
- Find production bugs
- Auto-fix obvious issues
- Flag edge cases for your approval
- Suggest test improvements

### Step 7: Test

```bash
/qa https://staging.bugproof.dev
```

The skill will:
- Open real Chromium browser
- Test your app end-to-end
- Find and fix bugs
- Generate regression tests

### Step 8: Ship

```bash
/ship
```

The skill will:
- Sync main branch
- Run full test suite
- Audit test coverage
- Push and open PR

### Step 9: Deploy

```bash
/land-and-deploy
```

The skill will:
- Merge PR
- Wait for CI
- Deploy to production
- Monitor for errors

---

## Directory Structure

```
BugProof/
│
├── .gstack/                    ← gstack setup & config
│   ├── setup.sh                   • Quick start (macOS/Linux)
│   ├── setup.bat                  • Quick start (Windows)
│   ├── setup-all-platforms.sh    • Multi-platform install
│   ├── setup-all-platforms.bat   • Multi-platform install (Windows)
│   ├── setup-mcp-servers.sh      • MCP registration
│   ├── .env.example              • Environment config template
│   └── README.md                 • gstack setup guide
│
├── docs/                       ← Project documentation
│   └── CONTEXT_MEMORY.md       • Context switching guide
│
├── README.md                   ← Project overview
├── Idea.md                     ← Product vision
├── CLAUDE.md                   ← gstack skills & guidelines
├── CONTRIBUTING.md             ← Development workflow
│
├── .env                        ← Environment config (copy from .gstack/.env.example)
├── .gitignore                  ← Git exclusions
├── .prettierrc                 ← Code formatting
├── .eslintrc                   ← Linting rules
│
├── package.json                ← Node.js dependencies
├── tsconfig.json               ← TypeScript config
├── jest.config.js              ← Testing config
│
├── src/                        ← Source code (create as needed)
│   ├── cli.ts
│   ├── capture/
│   ├── package/
│   └── run/
│
└── tests/                      ← Test suite (create as needed)
    └── __tests__/
```

---

## Platform Switching

### Scenario: Work in Claude Code, switch to OpenCode

1. **In Claude Code:**
   ```bash
   /office-hours
   # Design doc created, saved to GBrain
   git commit -m "feat: plan docker-export"
   ```

2. **Switch to OpenCode:**
   ```bash
   # Load gstack (auto-detected)
   /learn search docker-export
   # Design doc appears from GBrain
   /plan-eng-review
   # Architecture locked, saved to GBrain
   ```

3. **Switch to Antigravity:**
   ```bash
   # Load gstack (auto-detected)
   /learn search docker-export
   # Both prior docs visible in GBrain
   /qa https://staging.bugproof.dev
   # Test implementation
   ```

**No context lost.** All context flows through GBrain.

---

## Common Commands

```bash
# Planning
/office-hours              # 6 forcing questions
/plan-ceo-review          # Strategic scope
/plan-eng-review          # Lock architecture
/autoplan                 # Run all reviews auto

# Building
/design-consultation      # Build design system
/design-shotgun           # Explore mockup variants
/design-html              # Turn mockup → HTML

# Reviewing
/review                   # Find bugs + auto-fix
/codex                    # OpenAI independent review
/cso                      # Security audit (OWASP+STRIDE)

# Testing
/qa [url]                 # Live browser testing
/benchmark                # Page load baselines

# Shipping
/ship                     # Sync → test → PR
/land-and-deploy          # Merge → deploy → verify
/canary                   # Post-deploy monitoring

# Memory
/learn                    # View/search learnings
/learn prune [id]         # Remove old insights
/retro                    # Weekly retrospective

# Utilities
/browse                   # Real Chromium browser
/investigate              # Root-cause debugging
/careful                  # Safety guardrails
/freeze                   # Lock edits to one dir
/gstack-upgrade           # Self-update gstack
/setup-gbrain             # Initialize GBrain
```

---

## Configuration

### `.env` File

Copy `.gstack/.env.example` to `.env` and configure:

```bash
cp .gstack/.env.example .env
# Edit .env with your settings:
#   - AI_PLATFORM (claude, opencode, cursor, etc.)
#   - STAGING_URL
#   - PRODUCTION_URL
#   - DEPLOY_COMMAND
#   - etc.
```

### GBrain Setup

After initial setup:

```bash
# Change trust mode for repo (read-write, read-only, deny)
gstack-config set gbrain_trust_mode read-write

# Check GBrain connection
gstack-config get gbrain_connection

# View all learnings
/learn

# Export learnings to JSON
/learn export learnings.json
```

---

## Troubleshooting

### "Skills not showing"

```bash
cd ~/.claude/skills/gstack && ./setup
```

### "Context lost when switching platforms"

Set up GBrain:
```bash
/setup-gbrain
```

Then all context syncs automatically.

### "Stale gstack"

```bash
/gstack-upgrade
```

### "Browser issues"

```bash
cd ~/.claude/skills/gstack && bun install && bun run build
```

### "MCP not working"

```bash
# Re-register GBrain as MCP server
./setup-mcp-servers.sh
```

---

## Files Created

| File | Purpose |
|------|---------|
| `CLAUDE.md` | gstack skills and guidelines |
| `CONTRIBUTING.md` | Development workflow |
| `README.md` | Project overview |
| `docs/CONTEXT_MEMORY.md` | Context preservation guide |
| `.env.example` | Environment config template |
| `.gitignore` | Git exclusions |
| `.prettierrc` | Code formatting |
| `.eslintrc` | Linting |
| `setup.sh` / `setup.bat` | Quick start |
| `setup-gstack-all-platforms.sh/.bat` | Multi-platform setup |
| `setup-mcp-servers.sh` | MCP registration |
| `package.json` | Node.js config |
| `tsconfig.json` | TypeScript config |
| `jest.config.js` | Testing config |

---

## Next Actions

1. ✅ **Read CLAUDE.md** — understand gstack skills
2. ✅ **Run setup.sh** — initialize project
3. ✅ **Run /setup-gbrain** — persistent memory (recommended)
4. ✅ **Run /office-hours** — start planning first feature
5. ✅ **Run /plan-eng-review** — lock architecture
6. ✅ **Implement** — code based on plan
7. ✅ **Run /review** — code review
8. ✅ **Run /qa** — live testing
9. ✅ **Run /ship** — merge & PR

---

## Resources

- **gstack docs** — https://github.com/garrytan/gstack
- **GBrain docs** — https://github.com/garrytan/gbrain
- **BugProof idea** — see `Idea.md`
- **Context switching** — see `docs/CONTEXT_MEMORY.md`

---

## Questions?

See `CLAUDE.md` for gstack help. Or check the gstack repo:
https://github.com/garrytan/gstack

---

**Welcome to AI-assisted development with structured methodology and persistent memory!**

🚀 You're ready. Start with `/office-hours`.
