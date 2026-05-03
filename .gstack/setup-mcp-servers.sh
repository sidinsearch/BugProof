#!/usr/bin/env bash
# MCP Server setup for BugProof with gstack + GBrain
# Run this after /setup-gbrain to register MCP servers with Claude Code

set -e

echo "🔧 Setting up MCP servers for BugProof..."
echo ""

# Check if GBrain is initialized
if ! command -v gbrain &> /dev/null; then
  echo "❌ GBrain not found. Run /setup-gbrain first."
  exit 1
fi

# Register GBrain as MCP server
echo "📍 Registering GBrain MCP server..."
claude mcp add gbrain -- gbrain serve
echo "✅ GBrain registered"
echo ""

# Optional: Register other MCP servers if needed
echo "📋 Available optional MCP servers:"
echo "  • filesystem — file operations (already included in Claude Code)"
echo "  • git — version control operations"
echo "  • npm — Node.js dependency management"
echo ""

echo "✅ MCP setup complete!"
echo ""
echo "Usage in Claude Code:"
echo "  • gbrain search [query] — search persistent knowledge base"
echo "  • gbrain put_page [key] [content] — save session insights"
echo "  • Both are auto-used by all gstack skills"
echo ""
