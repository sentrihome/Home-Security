#!/bin/bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: ./make_app.sh <path-to-executable>"
  exit 1
fi

BIN="$1"
if [ ! -f "$BIN" ]; then
  echo "❌ File not found: $BIN"
  exit 1
fi

BIN_ABS="$(cd "$(dirname "$BIN")" && pwd)/$(basename "$BIN")"
NAME="$(basename "$BIN_ABS")"
APP="$(pwd)/${NAME}.app"

echo "▶ Bundling executable: $BIN_ABS"
echo "▶ Creating app: $APP"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Put the real binary here:
cp "$BIN_ABS" "$APP/Contents/MacOS/${NAME}_bin"
chmod +x "$APP/Contents/MacOS/${NAME}_bin"

# Info.plist (Finder runs CFBundleExecutable = $NAME)
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${NAME}</string>
  <key>CFBundleDisplayName</key><string>${NAME}</string>
  <key>CFBundleIdentifier</key><string>com.local.${NAME}</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>${NAME}</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# Launcher script (this is what Finder launches)
cat > "$APP/Contents/MacOS/${NAME}" <<EOF
#!/bin/bash
DIR="\$(cd "\$(dirname "\$0")" && pwd)"
BIN="\$DIR/${NAME}_bin"

/usr/bin/osascript -e 'tell application "Terminal" to activate' \
  -e "tell application \\"Terminal\\" to do script \\"cd \\\\\\"\$DIR\\\\\\"; \\\\\\"\$BIN\\\\\\"; echo; echo DONE; read -n 1\\""
EOF

chmod +x "$APP/Contents/MacOS/${NAME}"

# Remove quarantine (helps on other Macs too)
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo "✅ App created successfully:"
echo "   $APP"
echo "▶ Run with: open \"$APP\""
