# BugProof — Executable Bug Artifacts

> AI-assisted development with structured methodology and persistent context.

## Working Style

This project uses **gstack** for AI-assisted development. Each AI session automatically loads the following roles:

- **Office Hours**: Product interrogation with forcing questions
- **CEO Review**: Strategic scope validation  
- **Eng Review**: Architecture, data flow, tests
- **Design Review**: UI/UX validation with slop detection
- **DX Review**: Developer experience audit
- **Review**: Production bug detection + auto-fixes
- **QA**: Live browser testing with regression suite generation
- **Ship**: Merge → test → deploy verification
- **Security**: OWASP Top 10 + STRIDE threat modeling

## gstack

gstack is an open-source framework that turns Codex into a virtual engineering team. It's:
- **Free, MIT licensed** — available at https://github.com/garrytan/gstack
- **32 specialized skills** — think: CEO, Eng Manager, Designer, QA Lead, Release Eng
- **Cross-platform** — Codex, OpenCode, Cursor, OpenClaw, Codex, and others
- **Extensible** — add domain skills, integrate GBrain for persistent memory

### Installation

If gstack is not installed, paste this into your AI session to set up:

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.Codex/skills/gstack && \
cd ~/.Codex/skills/gstack && \
./setup --host auto
```

For OpenCode specifically:
```bash
./setup --host opencode
```

For OpenClaw agents:
```bash
(cd ~/.Codex/skills/gstack && ./setup --team) && \
~/.Codex/skills/gstack/bin/gstack-team-init required && \
git add .Codex/ AGENTS.md && \
git commit -m "require gstack for AI-assisted work"
```

### Available Skills

Use these slash commands in your AI session:

**Planning Phase**
- `/office-hours` — Product interrogation with 6 forcing questions
- `/plan-ceo-review` — Strategic challenge (Expansion/Hold/Reduction modes)
- `/plan-eng-review` — Architecture lock-in + data flow diagrams
- `/plan-design-review` — UI/UX validation (0-10 scoring per dimension)
- `/plan-devex-review` — Developer experience audit (20-45 forcing questions)
- `/autoplan` — Auto-run all reviews with encoded decision principles

**Building Phase**
- `/design-consultation` — Build design system from scratch
- `/design-shotgun` — Generate 4-6 mockup variants, compare visually
- `/design-html` — Turn mockup → production HTML (React/Vue/Svelte compatible)

**Reviewing Phase**
- `/review` — Find production bugs + auto-fix obvious ones
- `/design-review` — Designer audit + atomic fixes + screenshots
- `/devex-review` — Live DX testing (docs → TTHW → friction analysis)
- `/codex` — Independent OpenAI Codex review (cross-model analysis)

**Testing Phase**
- `/qa` — Real browser testing, find bugs, fix + verify with regression tests
- `/qa-only` — Bug reporting without code changes
- `/benchmark` — Page load, Core Web Vitals, resource size baselines
- `/canary` — Post-deploy monitoring (console errors, perf regressions)

**Shipping Phase**
- `/ship` — Sync main → test → push → PR creation
- `/land-and-deploy` — Merge → wait for CI → verify production
- `/document-release` — Update all docs to match shipped code

**Debugging & Utilities**
- `/investigate` — Systematic root-cause debugging
- `/browse` — Real Chromium browser with anti-bot stealth
- `/open-gstack-browser` — Headed GStack Browser with sidebar agent
- `/pair-agent` — Cross-agent coordination (multiple AI systems on same browser)
- `/learn` — Manage gstack learnings across sessions
- `/retro` — Weekly team-aware retrospective
- `/cso` — Chief Security Officer (OWASP + STRIDE)
- `/setup-browser-cookies` — Import cookies from your real browser
- `/setup-deploy` — One-time deploy configuration for /land-and-deploy
- `/setup-gbrain` — Initialize GBrain persistent knowledge
- `/careful` — Safety guardrails (warns before destructive commands)
- `/freeze` — Lock edits to one directory (debugging safety)
- `/guard` — Full safety (/careful + /freeze)
- `/gstack-upgrade` — Self-update gstack to latest

### Guidelines

1. **Always start with `/office-hours`** if the task has product implications
2. **Plan before building** — use `/plan-*` skills to lock architecture
3. **Review every PR** — run `/review` before `/ship`
4. **Test on real browser** — `/qa` catches bugs that CI misses
5. **Document as you ship** — `/document-release` keeps README current

---

## GBrain — Persistent Memory

GBrain is optional but strongly recommended for:
- **Context preservation** across sessions and platforms
- **Cross-platform continuity** — work started on Codex, continued in OpenCode
- **Institutional memory** — what you learned on BugProof stays with you

### Setup (one-time)

```bash
/setup-gbrain
```

Pick one:
- **PGLite local** (recommended for single-machine): Zero accounts, zero network, fast (~30 seconds)
- **Supabase existing** (team collaboration): Use existing Supabase URL
- **Supabase auto-provision** (new team): Auto-create Supabase project (~90 seconds)

### Usage

Once set up, GBrain is automatic:
- `/learn` — review, search, prune learnings
- All skills auto-save patterns and pitfalls
- Learnings compound across sessions

## GBrain Configuration (configured by /setup-gbrain)

- Engine: PGLite local
- Config file: `C:\Users\siddharth\.gbrain\config.json`
- Database path: `C:\Users\siddharth\.gbrain\brain.pglite`
- Setup date: 2026-05-03
- MCP registered: yes, in `C:\Users\siddharth\.codex\config.toml` as `[mcp_servers.gbrain]`
- MCP command: `c:\users\siddharth\.local\bin\gbrain.cmd serve`
- Memory sync: off
- Transcript ingest mode: incremental
- Current repo policy: unset because `D:\BugProof` is not currently a git repository
- Seeded pages: `bugproof-idea`, `bugproof-design-proof-capsule`, `bugproof-readme`, `bugproof-smoke`, `bugproof-setup-summary`
- Note: restart Codex after MCP config changes; MCP tools are loaded at session start.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke `/office-hours`
- Strategy/scope → invoke `/plan-ceo-review`
- Architecture → invoke `/plan-eng-review`
- Design system/plan review → invoke `/design-consultation` or `/plan-design-review`
- Full review pipeline → invoke `/autoplan`
- Bugs/errors → invoke `/investigate`
- QA/testing site behavior → invoke `/qa` or `/qa-only`
- Code review/diff check → invoke `/review`
- Visual polish → invoke `/design-review`
- Ship/deploy/PR → invoke `/ship` or `/land-and-deploy`
- Save progress → invoke `/context-save`
- Resume context → invoke `/context-restore`

---

## Platform Support

This project supports jumping between multiple AI coding platforms. Each platform auto-detects gstack:

| Platform | Host Flag | Skills Path | Status |
|----------|-----------|-------------|--------|
| Codex | `--host Codex` | `~/.Codex/skills/gstack-*/` | ✅ Fully supported |
| OpenCode | `--host opencode` | `~/.config/opencode/skills/gstack-*/` | ✅ Fully supported |
| Cursor | `--host cursor` | `~/.cursor/skills/gstack-*/` | ✅ Fully supported |
| Antigravity | `--host antigravity` | `~/.antigravity/skills/gstack-*/` | ✅ Fully supported |
| OpenClaw | `--host openclaw` | Via ClawHub or native skills | ✅ Fully supported |

If switching platforms mid-project:
1. gstack auto-detects on first run
2. GBrain syncs memory automatically (if configured)
3. All skills work identically across platforms

---

## MCP Servers

Model Context Protocol (MCP) servers extend Codex with typed tools. gstack automatically registers:

```bash
# After /setup-gbrain
Codex mcp add gbrain -- gbrain serve
```

This gives Codex:
- `gbrain search` — search persistent knowledge base
- `gbrain put_page` — save session insights to brain
- Full type hints + parameter validation

---

## Project Structure

```
BugProof/
├── .Codex/                 # Codex config (auto-created by gstack)
│   ├── config.yaml         # gstack configuration
│   └── skills/gstack       # gstack installation (symlink or submodule)
├── .agents/                # OpenClaw config (if using)
│   └── skills/gstack       # gstack for OpenClaw
├── .opencode/              # OpenCode config (if using)
│   └── skills/gstack       # gstack installation
├── AGENTS.md               # This file
├── CONTRIBUTING.md         # How to contribute
├── Idea.md                 # Product idea (see above)
├── DESIGN.md               # Design doc (auto-generated by /office-hours)
├── ARCHITECTURE.md         # Architecture (auto-generated by /plan-eng-review)
├── src/                    # Source code
├── tests/                  # Test suite
└── docs/                   # Documentation

```

---

## Workflow Examples

### Starting a New Feature

```
You:    I want to add Docker export to BugProof.
You:    /office-hours
Codex: [Forces assumptions into the open, identifies 3 implementation approaches]

You:    Approve Plan A. Exit plan mode.
You:    /plan-eng-review
Codex: [Architecture, data flow, edge cases, test matrix]

You:    /autoplan && approve decisions
Codex: [Runs CEO + design + eng, surfacing only taste decisions]

You:    Implement based on plan
Codex: /review → auto-fixes + asks on 2 edge cases → you approve
Codex: /qa https://staging.bugproof.dev → finds & fixes bug
Codex: /ship → tests, coverage audit, PR
```

### Debugging Production Issue

```
You:    Bug: Docker export hangs on 50MB artifacts
You:    /investigate
Codex: [Root cause: timeout on pipe stream, hypothesis testing, fix]
Codex: /review → verifies fix doesn't introduce new issues
Codex: /qa https://prod.bugproof.dev → confirms fix works
Codex: /land-and-deploy → merges, waits for CI, verifies production
```

### Cross-Platform Session

```
# Morning: Start work on Codex
User@Codex: /office-hours on new feature
[Design doc generated, saved to GBrain]

# Afternoon: Switch to OpenCode (same laptop, different AI)
User@OpenCode: Load gstack
[Reads design doc from GBrain automatically]
User@OpenCode: /plan-eng-review
[Locks architecture based on doc from GBrain]
```

---

## Troubleshooting

**Skills not showing?**
```bash
cd ~/.Codex/skills/gstack && ./setup
```

**Stale install?**
```bash
/gstack-upgrade
```

**Want shorter commands?** (remove `gstack-` prefix)
```bash
cd ~/.Codex/skills/gstack && ./setup --no-prefix
```

**gstack not visible in another platform?**
```bash
# Reinstall with platform-specific host
cd ~/.Codex/skills/gstack && ./setup --host opencode
```

---

## Resources

- **gstack repo** — https://github.com/garrytan/gstack
- **gstack docs** — skill deep dives, architecture, browser reference
- **Garry Tan on AI coding** — Fortune interview, No Priors podcast (March 2026)
- **BugProof idea** — see [Idea.md](./Idea.md)

---

## License

BugProof is MIT licensed. gstack is MIT licensed, free forever.
