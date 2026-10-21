#!/bin/sh
# Regenerates the app icon from build/icon.svg: build/icon.png (1024 px, also
# the Dock icon in development) and build/icon.icns (the built app's icon).
# Usage: npm run icon
set -e
cd "$(dirname "$0")/.."
base=${TMPDIR:-/tmp}
set_dir=$(mktemp -d "${base%/}/kuna-icon.XXXXXX")/icon.iconset
mkdir -p "$set_dir"
./node_modules/.bin/electron scripts/render-svg.cjs build/icon.svg build/icon.png 1024 > /dev/null 2>&1
for s in 16 32 128 256 512; do
  sips -z $s $s build/icon.png --out "$set_dir/icon_${s}x${s}.png" > /dev/null
  d=$((s * 2))
  sips -z $d $d build/icon.png --out "$set_dir/icon_${s}x${s}@2x.png" > /dev/null
done
iconutil -c icns "$set_dir" -o build/icon.icns
echo "build/icon.png and build/icon.icns updated"
