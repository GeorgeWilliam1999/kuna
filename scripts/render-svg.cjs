// Renders an SVG to a PNG with Electron's own Chromium, transparent background.
// Usage: electron scripts/render-svg.cjs <in.svg> <out.png> [size]   (see make-icon.sh)
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')

const [input, output, sizeArg] = process.argv.slice(-3).filter((a) => !a.startsWith('--'))
const size = Number(sizeArg) || 1024

app.disableHardwareAcceleration()
app.dock?.hide()
app.whenReady().then(async () => {
  const svg = readFileSync(input).toString('base64')
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  })
  const html = `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${svg}" width="${size}" height="${size}"></body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 400))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  writeFileSync(output, img.resize({ width: size, height: size }).toPNG())
  app.quit()
})
