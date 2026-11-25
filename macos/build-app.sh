#!/usr/bin/env bash
# Builds "Refresh TeamStats.app", which runs ./refresh.sh with a progress window, on the Desktop or at the given path.
set -euo pipefail

if [ "$(uname)" != Darwin ]; then
  echo "The refresh app is macOS only." >&2
  exit 1
fi

here=$(cd "$(dirname "$0")" && pwd)
app=${1:-"$HOME/Desktop/Refresh TeamStats.app"}
res="$app/Contents/Resources"

osacompile -o "$app" "$here/refresh.applescript"
cp "$here/progress.sh" "$res/progress.sh"
printf '%s' "$(dirname "$here")" > "$res/repo-dir"
sips -s format icns "$here/icon.png" --out "$res/applet.icns" >/dev/null
# osacompile's asset catalog icon wins over applet.icns while CFBundleIconName is set.
/usr/libexec/PlistBuddy -c 'Delete :CFBundleIconName' "$app/Contents/Info.plist" 2>/dev/null || true
codesign --force --sign - "$app" 2>/dev/null
touch "$app"
echo "Built $app"
