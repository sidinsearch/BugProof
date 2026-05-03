
# 🚀 BugProof + gstack Setup Dashboard

## ✅ Setup Status: COMPLETE

```
╔════════════════════════════════════════════════════════════════════════════╗
║                  BugProof Project Fully Configured                        ║
║                                                                            ║
║  Multi-Platform AI Development Framework                                  ║
║  • Claude Code ↔ OpenCode ↔ Cursor ↔ Antigravity ↔ OpenClaw             ║
║  • gstack (32 skills) + GBrain (persistent memory)                       ║
║  • Context preservation across all platforms                             ║
╚════════════════════════════════════════════════════════════════════════════╝
```

---

## 📋 What's Been Set Up

### 1. ✅ Multi-Platform gstack Installation
```
~/.claude/skills/gstack              ← Central installation
~/.config/opencode/skills/gstack     ← Links to central (if OpenCode exists)
~/.cursor/skills/gstack              ← Links to central (if Cursor exists)
~/.antigravity/skills/gstack         ← Links to central (if Antigravity exists)
~/.openclaw/skills/gstack            ← Links to central (if OpenClaw exists)
```

**Setup scripts:**
- `setup-gstack-all-platforms.sh` (macOS/Linux)
- `setup-gstack-all-platforms.bat` (Windows)

---

### 2. ✅ Context Preservation System

```
GBrain (Persistent Knowledge Base)
├── PGLite local: Zero network, single machine, ~30 seconds
└── Supabase: Cloud-based, team collaboration, multi-machine

Syncs automatically:
├── Design documents from /office-hours
├── Architecture decisions from /plan-eng-review
├── Test plans from /qa
├── Bug findings from /investigate
├── Performance baselines
└── Security audit results
```

**Configuration:**
- `.env.example` → copy to `.env` for custom settings
- GBrain trust mode (read-write, read-only, deny) — one-time per repo

---

### 3. ✅ gstack Skills (32 Total)

#### Planning (5)
```
/office-hours          → 6 forcing questions, reframe product
/plan-ceo-review       → Strategic scope validation
/plan-eng-review       → Architecture lock-in + diagrams
/plan-design-review    → UI/UX validation with AI slop detection
/plan-devex-review     → Developer experience audit
```

#### Building (3)
```
/design-consultation   → Build design system from scratch
/design-shotgun        → Explore 4-6 mockup variants visually
/design-html           → Turn mockup → production HTML
```

#### Reviewing (4)
```
/review                → Find production bugs + auto-fix
/codex                 → Independent OpenAI Codex review
/design-review         → Designer audit + atomic fixes
/devex-review          → Live DX testing (docs → TTHW → friction)
```

#### Testing (4)
```
/qa [url]              → Real browser testing, find bugs, fix
/qa-only [url]         → Bug reporting without code changes
/cso                   → Security audit (OWASP + STRIDE)
/benchmark             → Page load times + Core Web Vitals
```

#### Shipping (3)
```
/ship                  → Sync main → test → push → PR
/land-and-deploy       → Merge → wait CI → deploy → verify
/canary                → Post-deploy monitoring
```

#### Debugging & Utils (8)
```
/investigate           → Root-cause debugging
/browse                → Real Chromium browser with anti-bot
/open-gstack-browser   → Headed browser with sidebar agent
/pair-agent            → Cross-agent coordination
/learn                 → Manage learnings across sessions
/retro                 → Weekly team-aware retrospective
/careful               → Safety guardrails (destructive warnings)
/freeze / /guard       → Edit safety locks
```

#### Advanced (5)
```
/autoplan              → Auto-run CEO → design → eng review
/gstack-upgrade        → Self-update gstack
/setup-gbrain          → Initialize persistent memory
/setup-browser-cookies → Import from real browser
/setup-deploy          → One-time deploy config
```

---

### 4. ✅ Project Configuration

```
TypeScript Development
├── package.json        → Node.js + gstack deps
├── tsconfig.json       → TypeScript strict mode
├── jest.config.js      → Test framework
├── .prettierrc         → Code formatting (Prettier)
└── .eslintrc          → Linting (ESLint)

Documentation
├── README.md                      → Project overview
├── Idea.md                        → Product vision
├── CLAUDE.md                      → gstack skills guide
├── CONTRIBUTING.md                → Development workflow
├── SETUP_COMPLETE.md              → Complete setup guide
└── docs/CONTEXT_MEMORY.md         → Context switching guide

Git & Environment
├── .gitignore         → Excludes gstack state, env, build
└── .env.example       → Environment config template
```

---

### 5. ✅ MCP Server Integration

```
GBrain MCP Server
├── gbrain search [query]      → Search persistent knowledge base
├── gbrain put_page [key]      → Save insights to brain
└── Auto-used by all skills

Setup:
./setup-mcp-servers.sh        → Register GBrain as MCP server
```

---

## 🎯 Quick Start (5 minutes)

### Step 1: Initial Setup
```bash
cd BugProof
./.gstack/setup.sh              # macOS/Linux
# or
.\.gstack\setup.bat             # Windows
```

### Step 2: Persistent Memory (Recommended)
```bash
# In your AI platform (Claude Code, OpenCode, etc.)
/setup-gbrain

# Choose:
# 1. PGLite local (single machine, ~30 seconds)
# 2. Supabase (team collaboration)
```

### Step 3: Start Planning
```bash
/office-hours

# Answer 6 forcing questions about your feature
# Get: design doc, 3 implementation approaches
```

### Step 4: Lock Architecture
```bash
/plan-eng-review

# Get: architecture diagrams, data flow, test matrix
```

### Step 5: Build, Review, Test, Ship
```bash
# Build according to plan
[implement code]

# Review
/review

# Test
/qa https://staging.bugproof.dev

# Ship
/ship
```

---

## 🔄 Platform Switching (Zero Context Loss)

```
Morning (Claude Code):
  /office-hours
  → Design doc saved to GBrain
  
Afternoon (OpenCode):
  Load gstack (auto-detects)
  /learn search [feature]
  → Sees design doc from GBrain
  /plan-eng-review
  → Architecture saved to GBrain
  
Evening (Antigravity):
  Load gstack (auto-detects)
  /qa https://staging...
  → Sees all prior docs in GBrain
```

**Key:** GBrain syncs automatically. No manual context transfer needed.

---

## 📊 Workflow Overview

```
Think (1-2 hours)
  ↓ /office-hours → Design doc
  ↓ /plan-ceo-review → Scope validation
  ↓ /plan-eng-review → Architecture locked
  
Plan (0-1 hours)
  ↓ /autoplan → Run all reviews auto
  
Build (varies)
  ↓ Implement based on locked plan
  ↓ Commit frequently
  
Review (30 mins)
  ↓ /review → Code review + auto-fixes
  ↓ /codex → Independent review
  
Test (1-2 hours)
  ↓ /qa https://staging → Live browser testing
  ↓ Regression test auto-generated
  
Ship (15 mins)
  ↓ /ship → Merge to main + PR
  ↓ /land-and-deploy → Deploy + verify
  
Reflect (15 mins)
  ↓ /retro → Weekly retrospective
```

---

## 🛠️ Configuration

### Environment (.env)
```bash
cp .env.example .env
# Edit these (optional, sensible defaults provided):
AI_PLATFORM=claude                    # or opencode, cursor, antigravity
STAGING_URL=https://staging.bugproof.dev
PRODUCTION_URL=https://bugproof.dev
GSTACK_AUTO_UPGRADE=false
GSTACK_TELEMETRY=false
GBRAIN_SYNC_PRIVACY=artifacts-only
```

### GBrain Connection
```bash
# Local (recommended for solo dev)
file:/path/to/local.db

# Supabase (team collaboration)
postgresql://user:password@host:port/db
```

---

## 🔐 Security & Safety

```
Built-in:
├── /careful          → Warns before rm -rf, DROP TABLE, force-push
├── /guard            → Full safety mode (/careful + /freeze)
├── /freeze           → Lock edits to one directory
└── Prompt injection defense (sidebar security)

Privacy:
├── Telemetry: OFF by default (opt-in only)
├── GBrain Sync: Artifacts-only mode (no code sent)
└── Secret scanner: Blocks keys, tokens, JWTs before sending
```

---

## 📚 Documentation Files

| File | Read For |
|------|----------|
| `README.md` | Project overview |
| `CLAUDE.md` | gstack skills guide (READ FIRST) |
| `CONTRIBUTING.md` | Development workflow |
| `SETUP_COMPLETE.md` | Detailed setup guide |
| `docs/CONTEXT_MEMORY.md` | Cross-platform context switching |
| `Idea.md` | Product vision |

---

## 🚀 Next Actions

```
Priority | Action | Command
---------|--------|--------
1        | Read CLAUDE.md | cat CLAUDE.md
2        | Run setup | ./setup.sh (or setup.bat)
3        | Initialize GBrain | /setup-gbrain
4        | Plan first feature | /office-hours
5        | Lock architecture | /plan-eng-review
6        | Implement | [code]
7        | Review | /review
8        | Test | /qa
9        | Ship | /ship
```

---

## ✅ Verification Checklist

```
□ setup.sh exists and is executable
□ CLAUDE.md has gstack documentation
□ .env.example copied to .env (optional)
□ package.json has dependencies
□ tsconfig.json configured
□ docs/CONTEXT_MEMORY.md explains context preservation
□ README.md updated with BugProof idea
□ CONTRIBUTING.md explains workflow
□ No loss of configuration when switching AI platforms
□ GBrain ready for setup (one-time)
```

All ✅ Complete!

---

## Troubleshooting

**Problem:** Skills not showing
```bash
cd ~/.claude/skills/gstack && ./setup
```

**Problem:** Context lost switching platforms
```bash
/setup-gbrain  # Set up persistent memory
```

**Problem:** Stale gstack
```bash
/gstack-upgrade
```

**Problem:** MCP not working
```bash
./setup-mcp-servers.sh
```

---

## Resources

```
Official:
├── gstack: https://github.com/garrytan/gstack
├── GBrain: https://github.com/garrytan/gbrain
└── Garry Tan: https://x.com/garrytan

Documentation:
├── CLAUDE.md (this project)
├── CONTRIBUTING.md (this project)
└── docs/CONTEXT_MEMORY.md (this project)
```

---

```
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║  You're Ready! 🎉                                                          ║
║                                                                            ║
║  Start with: /office-hours                                                ║
║  Context syncs across all platforms automatically via GBrain              ║
║  No "works on my machine" — you have a full virtual engineering team      ║
║                                                                            ║
║  Questions? See CLAUDE.md or https://github.com/garrytan/gstack          ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
```

---

**Project:** BugProof (Executable bug artifacts)
**Framework:** gstack (23+ specialized AI skills)
**Memory:** GBrain (persistent knowledge across platforms)
**Platforms:** Claude Code, OpenCode, Cursor, Antigravity, OpenClaw
**Status:** ✅ Fully configured and ready
**Date:** May 3, 2026
