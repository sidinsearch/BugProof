#!/usr/bin/env bash
# BugProof quick-start setup
# Run this first to get everything configured

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  BugProof + gstack Setup                    ║"
echo "║     Executable bugs, not bug reports. AI-assisted dev.       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Check prerequisites
echo "1️⃣  Checking prerequisites..."
echo ""

missing=""

if ! command -v git &> /dev/null; then
  missing="$missing Git"
fi

if ! command -v node &> /dev/null; then
  missing="$missing Node.js"
fi

if ! command -v bun &> /dev/null; then
  missing="$missing Bun"
fi

if [ -n "$missing" ]; then
  echo "❌ Missing:$missing"
  echo ""
  echo "Install from:"
  echo "  • Git: https://git-scm.com/"
  echo "  • Node.js: https://nodejs.org/ (Windows users need this)"
  echo "  • Bun: https://bun.sh/ (v1.0+)"
  exit 1
fi

echo "✅ Git, Node.js, Bun installed"
echo ""

# Step 2: Detect AI platforms
echo "2️⃣  Detecting AI platforms..."
echo ""

PLATFORMS=""
if [ -d "$HOME/.claude/skills" ]; then
  PLATFORMS="${PLATFORMS}claude "
fi
if [ -d "$HOME/.config/opencode/skills" ]; then
  PLATFORMS="${PLATFORMS}opencode "
fi
if [ -d "$HOME/.cursor/skills" ]; then
  PLATFORMS="${PLATFORMS}cursor "
fi
if [ -d "$HOME/.antigravity/skills" ]; then
  PLATFORMS="${PLATFORMS}antigravity "
fi
if [ -d "$HOME/.openclaw/skills" ]; then
  PLATFORMS="${PLATFORMS}openclaw "
fi

if [ -z "$PLATFORMS" ]; then
  echo "❌ No AI platforms detected!"
  echo ""
  echo "Install one of:"
  echo "  • Claude Code: https://docs.anthropic.com/en/docs/claude-code"
  echo "  • OpenCode, Cursor, Antigravity, or OpenClaw"
  exit 1
fi

echo "✅ Found:${PLATFORMS}"
echo ""

# Step 3: Install gstack
echo "3️⃣  Installing gstack..."
echo ""

GSTACK_REPO="$HOME/.claude/skills/gstack"
if [ ! -d "$GSTACK_REPO" ]; then
  git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git "$GSTACK_REPO"
  echo "✅ gstack cloned"
else
  echo "ℹ️  gstack already installed"
fi

echo ""

# Step 4: Setup for each platform
echo "4️⃣  Setting up gstack for all platforms..."
echo ""

cd "$GSTACK_REPO"
./setup --host auto

echo ""
echo "✅ gstack configured for all platforms"
echo ""

# Step 5: Setup GBrain (optional)
echo "5️⃣  Setting up GBrain (persistent memory)..."
echo ""
echo "GBrain enables context to sync across AI platforms."
echo "It's optional but HIGHLY recommended."
echo ""
read -p "Set up GBrain now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "In your AI platform (Claude Code, OpenCode, etc.), run:"
  echo ""
  echo "  /setup-gbrain"
  echo ""
  echo "Then choose:"
  echo "  1. PGLite local (recommended for solo, ~30 seconds)"
  echo "  2. Supabase existing (team collaboration)"
  echo "  3. Supabase auto-provision (auto-create project)"
  echo ""
  echo "ℹ️  This is optional for now. You can run /setup-gbrain anytime."
else
  echo "⏭️  Skipping GBrain for now. You can run /setup-gbrain later."
fi

echo ""

# Step 6: Environment config
echo "6️⃣  Copying environment configuration..."
echo ""

if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || true
  echo "✅ .env created from .env.example"
  echo "   📝 Review and edit .env with your settings"
else
  echo "ℹ️  .env already exists"
fi

echo ""

# Step 7: Done!
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   ✅ Setup Complete!                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "🚀 Next steps:"
echo ""
echo "1. Open your AI platform (Claude Code, OpenCode, etc.)"
echo "2. Load gstack (usually automatic)"
echo "3. Start planning:"
echo ""
echo "   /office-hours"
echo ""
echo "   (Answer 6 forcing questions about what you want to build)"
echo ""
echo "4. Lock architecture:"
echo ""
echo "   /plan-eng-review"
echo ""
echo "5. Start implementing!"
echo ""

echo "📚 Learn more:"
echo "   • Project: see README.md"
echo "   • Development: see CONTRIBUTING.md"
echo "   • Context switching: see docs/CONTEXT_MEMORY.md"
echo "   • gstack skills: see CLAUDE.md"
echo ""

echo "💡 Tips:"
echo "   • Run /office-hours even for small tasks"
echo "   • Use /review before /ship"
echo "   • Use /qa on staging to catch real bugs"
echo "   • Use GBrain to preserve context across sessions"
echo ""

echo "Questions? See CLAUDE.md or https://github.com/garrytan/gstack"
echo ""
