#!/bin/sh
# `npm run dev` runs Kuna inside node_modules' Electron.app, and macOS takes the
# name in the menu bar, Dock and ⌘Tab (and the Dock icon) from that bundle, not
# from the code. Call it Kuna, with Kuna's icon. Runs after `npm install`;
# run it again by hand if Electron gets reinstalled some other way.
[ "$(uname)" = Darwin ] || exit 0
cd "$(dirname "$0")/.."
app=node_modules/electron/dist/Electron.app
[ -d "$app" ] || exit 0
/usr/libexec/PlistBuddy -c 'Set :CFBundleName Kuna' -c 'Set :CFBundleDisplayName Kuna' "$app/Contents/Info.plist"
[ -f build/icon.icns ] && cp build/icon.icns "$app/Contents/Resources/electron.icns"
# the edits invalidate the bundle's ad-hoc signature: sign it again, for this Mac
codesign --force --deep --sign - "$app" > /dev/null 2>&1
# make Finder and the Dock pick up the new name and icon
touch "$app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app" > /dev/null 2>&1
echo "development Electron.app is now called Kuna"
exit 0
