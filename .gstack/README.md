# .gstack Configuration & Setup

This folder contains all BugProof gstack setup and configuration files.

## Contents

### Setup Scripts

- **setup.sh** (macOS/Linux) — Interactive quick-start setup
- **setup.bat** (Windows) — Interactive quick-start setup
- **setup-all-platforms.sh** (macOS/Linux) — Multi-platform gstack installation
- **setup-all-platforms.bat** (Windows) — Multi-platform gstack installation
- **setup-mcp-servers.sh** — MCP server registration for GBrain

### Configuration

- **.env.example** — Environment configuration template
  - Copy to parent directory root as `.env` to customize
  - Includes: AI platform, gstack config, GBrain settings, project config

## Quick Start

### Option 1: One-Command Setup (Recommended)

**macOS/Linux:**
```bash
cd .. # Go to project root
.gstack/setup.sh
```

**Windows:**
```cmd
cd ..
.gstack\setup.bat
```

### Option 2: Manual Setup

**macOS/Linux:**
```bash
.gstack/setup-all-platforms.sh
```

**Windows:**
```cmd
.gstack\setup-all-platforms.bat
```

## What Gets Installed

1. **gstack** — 32 AI-assisted skills (plan, build, review, test, ship, debug)
2. **GBrain** (optional) — Persistent memory across AI platforms
3. **MCP servers** — Claude Code integration for typed tools

## After Setup

1. Run `/setup-gbrain` in your AI platform (recommended for persistent memory)
2. Run `/office-hours` to start planning your first feature
3. Run `/plan-eng-review` to lock architecture
4. Implement based on locked plan
5. Run `/review` before shipping
6. Run `/qa` for live browser testing
7. Run `/ship` to merge and create PR

## Platform Support

gstack auto-detects and works with:
- Claude Code
- OpenCode
- Cursor
- Antigravity
- OpenClaw

## Files in Parent Directory

```
../
├── README.md             # Project overview
├── Idea.md              # Product vision
├── CLAUDE.md            # gstack skills documentation
├── CONTRIBUTING.md      # Development workflow
├── SETUP_COMPLETE.md    # Complete setup guide
├── SETUP_DASHBOARD.md   # Visual setup dashboard
├── package.json         # Node.js config
├── tsconfig.json        # TypeScript config
├── jest.config.js       # Testing config
├── .prettierrc          # Code formatter
├── .eslintrc           # Linting rules
├── .gitignore          # Git exclusions
├── src/                # Project source code
├── tests/              # Project tests
└── docs/               # Project documentation
```

## Environment Configuration

Copy `.env.example` to `../.env` (parent directory) for custom configuration:

```bash
cp .env.example ../.env
# Edit ../.env with your settings
```

Key options:
- `AI_PLATFORM` — which AI platform to use
- `STAGING_URL` — URL for /qa testing
- `PRODUCTION_URL` — URL for production verification
- `GBRAIN_SYNC_PRIVACY` — privacy mode for GBrain

## Troubleshooting

### Skills not showing
```bash
cd ~/.claude/skills/gstack && ./setup
```

### Context lost when switching platforms
```bash
/setup-gbrain  # Set up GBrain for persistent memory
```

### Stale gstack
```bash
/gstack-upgrade
```

## Resources

- **gstack repo:** https://github.com/garrytan/gstack
- **GBrain repo:** https://github.com/garrytan/gbrain
- **gstack documentation:** See ../CLAUDE.md

---

**Note:** This folder is for gstack configuration. Project source code lives in the parent directory.
