#!/bin/sh
# `npm run dev` runs Kuna inside node_modules' Electron.app, and macOS takes the
# name in the menu bar, Dock and ⌘Tab (and the Dock icon) from that bundle, not
# from the code: the menu bar reads CFBundleName, the Dock and ⌘Tab the bundle's
# folder name. So the bundle becomes Kuna.app, with Kuna's name and icon, and
# Electron's path.txt points at it. Runs after `npm install`; run it again by
# hand if Electron gets reinstalled some other way.
[ "$(uname)" = Darwin ] || exit 0
cd "$(dirname "$0")/.."
dist=node_modules/electron/dist
# a fresh Electron download unpacks a new Electron.app: it replaces Kuna.app
if [ -d "$dist/Electron.app" ] && [ ! -L "$dist/Electron.app" ]; then
  rm -rf "$dist/Kuna.app"
  mv "$dist/Electron.app" "$dist/Kuna.app"
fi
app=$dist/Kuna.app
[ -d "$app" ] || exit 0
/usr/libexec/PlistBuddy -c 'Set :CFBundleName Kuna' -c 'Set :CFBundleDisplayName Kuna' "$app/Contents/Info.plist"
[ -f build/icon.icns ] && cp build/icon.icns "$app/Contents/Resources/electron.icns"
# the edits invalidate the bundle's ad-hoc signature: sign it again, for this Mac
codesign --force --deep --sign - "$app" > /dev/null 2>&1
# `require('electron')` and electron-vite find the executable through path.txt
printf %s Kuna.app/Contents/MacOS/Electron > node_modules/electron/path.txt
# make Finder and the Dock pick up the new name and icon
touch "$app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app" > /dev/null 2>&1
echo "development Electron.app is now Kuna.app"
exit 0
