#!/usr/bin/env bash
# BugProof multi-platform gstack setup
# Installs gstack for all AI coding platforms you have installed
# Supports: Claude Code, OpenCode, Cursor, Antigravity, OpenClaw

set -e

echo "🚀 BugProof gstack setup"
echo ""

# Detect which platforms are installed
PLATFORMS=()
declare -A PLATFORM_PATHS
declare -A PLATFORM_NAMES

# Claude Code
if [ -d "$HOME/.claude/skills" ]; then
  PLATFORMS+=("claude")
  PLATFORM_PATHS["claude"]="$HOME/.claude/skills"
  PLATFORM_NAMES["claude"]="Claude Code"
fi

# OpenCode
if [ -d "$HOME/.config/opencode/skills" ]; then
  PLATFORMS+=("opencode")
  PLATFORM_PATHS["opencode"]="$HOME/.config/opencode/skills"
  PLATFORM_NAMES["opencode"]="OpenCode"
fi

# Cursor
if [ -d "$HOME/.cursor/skills" ]; then
  PLATFORMS+=("cursor")
  PLATFORM_PATHS["cursor"]="$HOME/.cursor/skills"
  PLATFORM_NAMES["cursor"]="Cursor"
fi

# Antigravity
if [ -d "$HOME/.antigravity/skills" ]; then
  PLATFORMS+=("antigravity")
  PLATFORM_PATHS["antigravity"]="$HOME/.antigravity/skills"
  PLATFORM_NAMES["antigravity"]="Antigravity"
fi

# OpenClaw
if [ -d "$HOME/.openclaw/skills" ]; then
  PLATFORMS+=("openclaw")
  PLATFORM_PATHS["openclaw"]="$HOME/.openclaw/skills"
  PLATFORM_NAMES["openclaw"]="OpenClaw"
fi

if [ ${#PLATFORMS[@]} -eq 0 ]; then
  echo "❌ No AI coding platforms detected!"
  echo ""
  echo "Make sure you have at least one installed:"
  echo "  • Claude Code (https://docs.anthropic.com/en/docs/claude-code)"
  echo "  • OpenCode"
  echo "  • Cursor"
  echo "  • Antigravity"
  echo "  • OpenClaw"
  exit 1
fi

echo "✅ Detected ${#PLATFORMS[@]} platform(s):"
for platform in "${PLATFORMS[@]}"; do
  echo "   • ${PLATFORM_NAMES[$platform]}"
done
echo ""

# Clone gstack if not already installed
GSTACK_REPO="$HOME/.claude/skills/gstack"
if [ ! -d "$GSTACK_REPO" ]; then
  echo "📥 Cloning gstack..."
  git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git "$GSTACK_REPO"
  echo "✅ gstack cloned"
else
  echo "ℹ️  gstack already installed at $GSTACK_REPO"
fi

echo ""
echo "⚙️  Setting up gstack for each platform..."
echo ""

# Setup for each platform
for platform in "${PLATFORMS[@]}"; do
  echo "📦 Setting up ${PLATFORM_NAMES[$platform]}..."
  cd "$GSTACK_REPO"
  ./setup --host "$platform"
  echo "✅ ${PLATFORM_NAMES[$platform]} configured"
  echo ""
done

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start using gstack: try /office-hours"
echo "  2. Optional: run /setup-gbrain for persistent memory"
echo "  3. Optional: switch platforms anytime, gstack auto-detects"
echo ""
echo "For help: see ../CLAUDE.md in this project"
