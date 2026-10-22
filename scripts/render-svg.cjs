// Renders an SVG to a PNG with Electron's own Chromium, transparent background.
// Usage: electron scripts/render-svg.cjs <in.svg> <out.png> [size | WxH]   (see make-icon.sh)
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')

const [input, output, sizeArg] = process.argv.slice(-3).filter((a) => !a.startsWith('--'))
const [w, h] = String(sizeArg || '').split('x').map(Number)
const width = w || 1024
const height = h || width

app.disableHardwareAcceleration()
app.dock?.hide()
app.whenReady().then(async () => {
  const svg = readFileSync(input).toString('base64')
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  })
  const html = `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${svg}" width="${width}" height="${height}"></body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 400))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width, height })
  writeFileSync(output, img.resize({ width, height }).toPNG())
  app.quit()
})
