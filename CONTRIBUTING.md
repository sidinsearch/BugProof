# Contributing to BugProof

> Using gstack for structured, context-aware development across multiple AI platforms

## Prerequisites

- **Git** — version control
- **Node.js** — runtime (Windows users need this + Bun)
- **Bun** — modern runtime (v1.0+)
- **One AI coding platform:**
  - Claude Code (recommended)
  - OpenCode
  - Cursor
  - Antigravity
  - OpenClaw

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/bugproof.git
cd bugproof
```

### 2. Install gstack (all platforms)

**macOS/Linux:**
```bash
./.gstack/setup.sh
```

**Windows:**
```bash
.\.gstack\setup.bat
```

Or manually:
```bash
./.gstack/setup-all-platforms.sh    # macOS/Linux
.\.gstack\setup-all-platforms.bat   # Windows
```

See [.gstack/README.md](./.gstack/README.md) for more options.

### 3. Copy environment config

```bash
cp .gstack/.env.example .env
# Edit .env with your preferences
```

### 4. Set up GBrain (persistent memory)

```bash
/setup-gbrain
```

Choose:
- **PGLite local** — single machine, recommended for solo development
- **Supabase cloud** — team collaboration, multi-machine access

This is one-time only and enables context preservation across platforms.

### 5. Start coding

```bash
/office-hours
```

Describe what you want to build. The skill will ask 6 forcing questions to clarify the product, then suggest 3 implementation approaches.

---

## Development Workflow

### Phase 1: Planning (Think)

```bash
/office-hours
```

**Output:** Design document (saved as `DESIGN.md` in repo)

Then review with stakeholders:

```bash
/plan-ceo-review --mode Expansion
```

**Output:** Strategic scope validation

Then lock architecture:

```bash
/plan-eng-review
```

**Output:** Architecture document (saved as `ARCHITECTURE.md`)

Approve the plan before coding.

### Phase 2: Building (Build)

Implement based on the locked design and architecture. Use gstack's `/design-*` skills if building UI:

```bash
/design-consultation        # Build design system
/design-shotgun             # Explore mockup variants visually
/design-html                # Turn mockup → production HTML
```

Commit frequently:
```bash
git add .
git commit -m "feat: implement [feature from design doc]"
```

### Phase 3: Reviewing (Review)

Before merging, run code review:

```bash
/review
```

This skill:
- ✅ Auto-fixes obvious issues
- ⚠️ Flags edge cases (you approve the fix)
- ✅ Suggests test improvements
- ✅ Catches security issues

Fix any issues, then:

```bash
/codex
```

Get an independent review from OpenAI Codex (cross-model analysis when both run).

### Phase 4: Testing (Test)

Run live browser testing on staging:

```bash
/qa https://staging.bugproof.dev
```

This skill:
- 🌐 Opens real Chromium browser
- 🔍 Tests the app end-to-end
- 🐛 Finds and fixes bugs
- ✅ Auto-generates regression tests
- 🔄 Re-verifies fixes

### Phase 5: Shipping (Ship)

When everything is ready:

```bash
/ship
```

This skill:
- 📥 Syncs latest from main
- ✅ Runs full test suite
- 📊 Audits test coverage
- 🔀 Pushes branch
- 🔗 Opens GitHub PR

Then deploy:

```bash
/land-and-deploy
```

This skill:
- ✅ Waits for CI to pass
- 🚀 Merges to main
- 🚢 Deploys to production
- 🔍 Monitors for errors
- ✅ Verifies health

### Phase 6: Reflecting (Reflect)

Weekly retrospective:

```bash
/retro
```

Learns from this sprint for next time.

---

## Jumping Between Platforms

### Before switching:

1. Commit your work:
   ```bash
   git add .
   git commit -m "WIP: [feature]"
   ```

2. Update shared context:
   ```bash
   # Automatic if using GBrain
   /learn
   ```

### When switching to a different platform:

1. Load gstack on the new platform (auto-detected)

2. Resume context:
   ```bash
   /learn search [recent work]
   ```

3. Continue coding:
   ```bash
   /qa https://staging.bugproof.dev
   # or
   /review
   ```

**Example workflow:**

```
Morning (Claude Code):
  /office-hours
  → Design doc auto-saved to GBrain

Afternoon (OpenCode):
  /review on existing PR
  → Reads design doc from GBrain automatically

Evening (Antigravity):
  /qa https://staging.bugproof.dev
  → All prior findings visible in GBrain
```

---

## Context Preservation

### Using GBrain (Recommended)

After `/setup-gbrain`, all context is automatic:

```
Design docs     → GBrain
Architecture    → GBrain
Test plans      → GBrain
Bug findings    → GBrain
Performance data → GBrain
```

All skills read and write to GBrain automatically.

### Without GBrain

Manually update `.claude/context/active-decisions.md`:

```markdown
# Active Decisions

## Feature: Docker Export
- Status: In review
- Owner: [your platform/date]
- Branch: feat/docker-export
- Last update: 2026-05-03

## Open Questions
- [ ] Error handling for incomplete exports?

## Findings
- Performance: Hangs on 50MB+ artifacts
- Root cause: Timeout issue (increased to 60s)
```

---

## Common Tasks

### Add a new skill (advanced)

Skills live in `~/.claude/skills/gstack/[skill-name]/`. Each skill is:

- `.instructions.md` — skill instructions for Claude
- `src/` — TypeScript code (runs inside Claude Code)
- `SKILL.md` — documentation

### Debug a specific platform issue

```bash
# Check if gstack sees the platform
cd ~/.claude/skills/gstack
./setup

# Rebuild gstack for your platform
bun run build

# Re-run /setup-gbrain if context isn't syncing
/setup-gbrain --switch
```

### Monitor performance

```bash
# Baseline page load times
/benchmark
```

### Security audit

```bash
# OWASP Top 10 + STRIDE threat model
/cso
```

---

## Code Style & Conventions

- **Commits:** Use conventional format — `feat:`, `fix:`, `docs:`, `test:`, `refactor:`
- **Branches:** Feature branches: `feat/[name]`, Bug branches: `fix/[name]`
- **Tests:** Run before committing — `npm test`
- **Docs:** Update README/ARCHITECTURE when shipping features

Example:

```bash
git checkout -b feat/docker-export
npm test                # passes
/review                 # auto-fixes, you approve
/ship                   # merge → PR
```

---

## Troubleshooting

### Skills not visible

```bash
cd ~/.claude/skills/gstack && ./setup
```

### Context lost when switching platforms

```bash
/setup-gbrain          # if not done yet
/learn search [topic]  # review learnings
```

### Stale gstack installation

```bash
/gstack-upgrade
```

### Browser issues (/qa fails)

```bash
cd ~/.claude/skills/gstack && bun install && bun run build
```

### MCP not working

```bash
claude mcp list         # see registered servers
claude mcp remove gbrain
/setup-gbrain          # re-initialize
```

---

## CI/CD Pipeline

The `.github/workflows/` directory contains:

- **test.yml** — Run tests on every PR
- **deploy.yml** — Deploy to staging on merge to main
- **prod-deploy.yml** — Deploy to production on tag

All skills check CI status before proceeding:

```bash
/land-and-deploy       # waits for CI, then deploys
```

---

## Resources

- **gstack docs** — https://github.com/garrytan/gstack
- **BugProof idea** — [Idea.md](./Idea.md)
- **Context guide** — [docs/CONTEXT_MEMORY.md](./docs/CONTEXT_MEMORY.md)
- **Environment config** — [.env.example](./.env.example)

---

## Questions?

- **gstack questions** — see [CLAUDE.md](./CLAUDE.md)
- **Project questions** — create a GitHub issue
- **Feature ideas** — open a discussion on GitHub

---

**TL;DR:**

```bash
# Setup (one-time)
./setup-gstack-all-platforms.sh
/setup-gbrain

# Development
/office-hours              # plan
/plan-eng-review          # lock architecture
[implement]
/review                   # code review
/qa https://staging...    # live testing
/ship                     # merge to main

# Switching platforms
# Just load gstack on new platform, context syncs automatically from GBrain
```
