#!/usr/bin/env bash
# BugProof Linux file association setup
# Registers .bug files and creates MIME type association

set -e

echo "🐧 Setting up BugProof file associations on Linux..."

# Create MIME type file
MIME_FILE="/usr/share/mime/packages/bugproof-bug.xml"
if [ -f "$MIME_FILE" ]; then
  echo "✓ MIME type already registered"
else
  sudo tee "$MIME_FILE" > /dev/null <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-bugproof">
    <comment>BugProof Bug Artifact</comment>
    <glob pattern="*.bug"/>
    <magic priority="50">
      <match type="string" value="PK\x03\x04" offset="0"/>
    </magic>
  </mime-type>
</mime-info>
EOF
  echo "✓ MIME type registered at $MIME_FILE"
fi

# Update MIME database
if command -v update-mime-database &> /dev/null; then
  sudo update-mime-database /usr/share/mime
  echo "✓ MIME database updated"
fi

# Create .desktop file for replay action
DESKTOP_REPLAY="/usr/share/applications/bugproof-replay.desktop"
sudo tee "$DESKTOP_REPLAY" > /dev/null <<'EOF'
[Desktop Entry]
Type=Application
Name=BugProof Replay
Exec=bugproof replay %F
MimeType=application/x-bugproof
Icon=bugproof
NoDisplay=true
EOF
echo "✓ Desktop entry created for replay"

# Create .desktop file for inspect action
DESKTOP_INSPECT="/usr/share/applications/bugproof-inspect.desktop"
sudo tee "$DESKTOP_INSPECT" > /dev/null <<'EOF'
[Desktop Entry]
Type=Application
Name=BugProof Inspect
Exec=bugproof inspect %F
MimeType=application/x-bugproof
Icon=bugproof
NoDisplay=true
EOF
echo "✓ Desktop entry created for inspect"

# Install icon
ICON_DIR="/usr/share/icons/hicolor/512x512/apps"
if [ -d "$ICON_DIR" ]; then
  sudo cp assets/icon-512x512.png "$ICON_DIR/bugproof.png" 2>/dev/null || true
  echo "✓ Icon installed to $ICON_DIR"
fi

# Set default handler for .bug files
if command -v xdg-mime &> /dev/null; then
  xdg-mime default bugproof-replay.desktop application/x-bugproof
  echo "✓ Set default handler to BugProof Replay"
fi

echo ""
echo "✅ BugProof file association setup complete!"
echo ""
echo "🎯 You can now:"
echo "  • Double-click .bug files to replay them"
echo "  • Right-click → Open With → BugProof Replay"
echo "  • Command: bugproof replay artifact.bug"
