#!/usr/bin/env bash
# BugProof macOS file association setup
# Registers .bug files for macOS

set -e

echo "🍎 Setting up BugProof file associations on macOS..."

# Create UTType definition
PLIST_FILE="$HOME/Library/LaunchAgents/com.bugproof.uti.plist"
mkdir -p "$(dirname "$PLIST_FILE")"

cat > "$PLIST_FILE" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>UTTypeIdentifier</key>
  <string>com.bugproof.artifact</string>
  <key>UTTypeDescription</key>
  <string>BugProof Bug Artifact</string>
  <key>UTTypeConformsTo</key>
  <array>
    <string>public.data</string>
  </array>
  <key>UTTypeTagSpecification</key>
  <dict>
    <key>com.apple.ostype</key>
    <string>BUGF</string>
    <key>public.filename-extension</key>
    <array>
      <string>bug</string>
    </array>
    <key>public.mime-type</key>
    <string>application/x-bugproof</string>
  </dict>
</dict>
</plist>
EOF

# Update LaunchServices database
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user

echo "✓ macOS UTType registered"
echo ""
echo "✅ BugProof file association setup complete on macOS!"
echo ""
echo "🎯 You can now double-click .bug files to replay them"
