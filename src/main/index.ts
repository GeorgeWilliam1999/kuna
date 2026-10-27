import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, clipboard, ipcMain, Menu, session, shell, type MenuItemConstructorOptions } from 'electron'
import { IPC } from '@shared/ipc'
import type { PersistedState, SpawnRequest } from '@shared/types'
import { AgentService } from './agents'
import { backendsFile, loadBackends } from './backends'
import { ClaudeFilesService, MediaService } from './files'
import { detectFonts } from './fonts'
import { PtyService } from './pty'
import { adoptLoginShellPath } from './shellEnv'
import { listSshHosts } from './sshHosts'
import { Store } from './store'

let win: BrowserWindow | undefined
/**
 * Development hooks (scripted runs, a separate profile, the dev server, DevTools)
 * exist only when running from source; a built Kuna.app ignores the variables.
 */
const fromSource = !app.isPackaged
const automation = fromSource ? process.env.KUNA_AUTOMATION : undefined
const store = new Store()
const agents = new AgentService(
  () => store.state.projects,
  () => loadBackends().backends
)
const media = new MediaService(agents)
const claudeFiles = new ClaudeFilesService(agents)
const ptys = new PtyService(() => win?.webContents)

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

agents.on('hosts', (s) => send(IPC.hostsState, s))
agents.on('agents', (a) => send(IPC.agentsUpdate, a))
agents.on('details', (k, d) => send(IPC.agentsDetailsUpdate, k, d))
agents.on('usage', (u) => send(IPC.usageUpdate, u))

function registerIpc(): void {
  ipcMain.handle(IPC.stateLoad, () => store.load())
  ipcMain.handle(IPC.stateSave, (_e, s: PersistedState) => store.save(s))
  // the last save when the window closes: synchronous, so it lands before quit
  ipcMain.on(IPC.stateSaveSync, (e, s: PersistedState) => {
    try {
      store.save(s)
    } finally {
      e.returnValue = true
    }
  })
  ipcMain.handle(IPC.sshHosts, () => listSshHosts())
  ipcMain.handle(IPC.fonts, () => detectFonts())
  ipcMain.handle(IPC.clipboardText, () => clipboard.readText())
  ipcMain.on(IPC.copyText, (_e, text: string) => clipboard.writeText(text))
  ipcMain.on(IPC.windowButtons, (_e, visible: boolean) => {
    if (process.platform === 'darwin') win?.setWindowButtonVisibility(visible)
  })

  ipcMain.handle(IPC.hostsWatch, (_e, hosts: string[]) => agents.watch(hosts))
  ipcMain.handle(IPC.hostsReconnect, (_e, host: string) => agents.reconnect(host))

  ipcMain.handle(IPC.agentsSpawn, (_e, req: SpawnRequest) => agents.spawn(req))
  ipcMain.handle(IPC.agentsBackends, () => loadBackends())
  ipcMain.handle(IPC.agentsEditBackends, async () => {
    const err = await shell.openPath(backendsFile())
    if (err) throw new Error(err)
  })
  ipcMain.handle(IPC.agentsKill, (_e, key: string) => agents.kill(key))
  ipcMain.handle(IPC.agentsRespawn, (_e, key: string) => agents.respawn(key))
  ipcMain.on(IPC.agentsInterest, (_e, keys: string[]) => agents.setInterest(keys))
  ipcMain.handle(IPC.agentsKey, (_e, key: string, keys: string[]) => agents.sendKeys(key, keys))
  ipcMain.handle(IPC.agentsSend, (_e, key: string, text: string) => agents.sendText(key, text))
  ipcMain.handle(IPC.agentsDetails, (_e, key: string) => agents.details(key))
  ipcMain.handle(IPC.usageGet, () => agents.usage())

  ipcMain.handle(IPC.ptyAttach, (_e, key: string, cols: number, rows: number) => {
    const { host, id } = agents.locate(key)
    const cmd = host.attachCommand(id)
    return ptys.open(cmd.file, cmd.args, cols, rows, () => host.releasePane())
  })
  ipcMain.handle(IPC.ptyLogin, (_e, host: string, cols: number, rows: number) => {
    const cmd = agents.host(host).loginCommand()
    return ptys.open(cmd.file, cmd.args, cols, rows)
  })
  ipcMain.on(IPC.ptyWrite, (_e, id: string, data: string) => ptys.write(id, data))
  ipcMain.on(IPC.ptyResize, (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.on(IPC.ptyClose, (_e, id: string) => ptys.close(id))

  ipcMain.handle(IPC.mediaList, (_e, key: string, page?: { before?: number; scan?: boolean }) => media.list(key, page))
  ipcMain.handle(IPC.mediaFetch, (_e, host: string, path: string, stamp?: string) => media.fetch(host, path, stamp))
  ipcMain.handle(IPC.mediaOpen, (_e, host: string, path: string, stamp?: string) => media.openExternal(host, path, stamp))
  ipcMain.handle(IPC.mediaSave, (_e, host: string, path: string, stamp?: string) => media.save(host, path, stamp))

  ipcMain.handle(IPC.claudeList, (_e, host: string, cwds: string[]) => claudeFiles.list(host, cwds))
  ipcMain.handle(IPC.claudeRead, (_e, host: string, path: string) => claudeFiles.read(host, path))
  ipcMain.handle(IPC.fsDirs, (_e, host: string, dir: string) => claudeFiles.dirs(host, dir))
  ipcMain.handle(IPC.fsRealPaths, (_e, host: string, paths: string[]) => claudeFiles.realPaths(host, paths))
}

function buildMenu(): void {
  // No Cmd+W "Close Window" here: in Kuna Cmd+W closes the focused tab.
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }]
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'Shift+CmdOrCtrl+R' },
        ...(fromSource ? [{ role: 'toggleDevTools' } as const] : []),
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: fromSource
    }
  })
  // scripted runs don't take the focus (and the keystrokes) from whatever the user is doing
  // the close/minimize/zoom buttons only show over the sidebar (the renderer
  // says when); hidden, they would sit on the pane headers
  if (process.platform === 'darwin') win.setWindowButtonVisibility(false)
  win.once('ready-to-show', () => (automation ? win?.showInactive() : win?.show()))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.on('closed', () => {
    win = undefined
    ptys.dispose()
  })

  if (fromSource && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.setName('Kuna')

// When Kuna is started from inside a Claude Code session (e.g. `npm run dev` in
// a terminal agent), don't let that session's identity leak into new agents.
for (const k of Object.keys(process.env)) {
  if (/^(CLAUDECODE|CLAUDE_CODE_\w+|CLAUDE_PID|CLAUDE_JOB_DIR|CLAUDE_EFFORT|AI_AGENT)$/.test(k)) delete process.env[k]
}
// Separate profile for demos and tests: KUNA_USER_DATA=/tmp/kuna-demo npm start
if (fromSource && process.env.KUNA_USER_DATA) app.setPath('userData', process.env.KUNA_USER_DATA)

/**
 * Scripted runs for screenshots/docs: KUNA_AUTOMATION=script.js runs the file in
 * the renderer after load; the script may call kunaDev.capture(name) (written to
 * KUNA_SHOT_DIR) and kunaDev.quit().
 */
function registerAutomation(): void {
  if (!automation) return
  const shots = process.env.KUNA_SHOT_DIR
  ipcMain.handle('dev:capture', async (_e, name: string) => {
    if (!shots || !win) return
    const img = await win.webContents.capturePage()
    writeFileSync(join(shots, `${name.replace(/[^\w-]/g, '_')}.png`), img.toPNG())
  })
  ipcMain.handle('dev:quit', () => app.quit())
  // the native window id, for screenshots that include the window chrome (screencapture -l)
  ipcMain.handle('dev:window-id', () => win?.getMediaSourceId())
  // paste text as ⌘V would, leaving the user's clipboard as it was
  ipcMain.handle('dev:paste', async (_e, text: string, viaShortcut = false) => {
    const before = await clipboard.readText()
    await clipboard.writeText(text)
    if (viaShortcut) {
      win?.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'v', modifiers: ['meta'] })
      win?.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'v', modifiers: ['meta'] })
    } else win?.webContents.paste()
    await new Promise((r) => setTimeout(r, 300))
    await clipboard.writeText(before)
  })
  // real key presses (default actions included, unlike synthetic DOM events)
  ipcMain.handle('dev:key', (_e, keyCode: string, modifiers: ('shift' | 'meta' | 'alt' | 'control')[] = []) => {
    const wc = win?.webContents
    if (!wc) return
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    const ch = keyCode === 'Space' ? ' ' : keyCode === 'Return' ? '\r' : keyCode.length === 1 ? keyCode : undefined
    if (ch) wc.sendInputEvent({ type: 'char', keyCode: ch, modifiers })
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  })
  // click an app menu item by role ('copy', 'paste'…), as its shortcut would
  ipcMain.handle('dev:menu', (_e, role: string) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const it of items) {
        if (it.role?.toLowerCase() === role.toLowerCase()) return it
        const sub = it.submenu && find(it.submenu.items)
        if (sub) return sub
      }
      return undefined
    }
    const item = find(Menu.getApplicationMenu()?.items ?? [])
    item?.click(undefined, win ?? undefined, win?.webContents)
    return !!item
  })
  // a real mouse drag from one point to another (CSS pixels), with modifiers held
  ipcMain.handle('dev:drag', async (_e, from: [number, number], to: [number, number], modifiers: ('shift' | 'meta' | 'alt' | 'control')[] = []) => {
    const wc = win?.webContents
    if (!wc) return
    const pause = (): Promise<unknown> => new Promise((r) => setTimeout(r, 30))
    wc.sendInputEvent({ type: 'mouseMove', x: from[0], y: from[1], modifiers })
    wc.sendInputEvent({ type: 'mouseDown', x: from[0], y: from[1], button: 'left', clickCount: 1, modifiers })
    for (let i = 1; i <= 8; i++) {
      await pause()
      const x = Math.round(from[0] + ((to[0] - from[0]) * i) / 8)
      const y = Math.round(from[1] + ((to[1] - from[1]) * i) / 8)
      wc.sendInputEvent({ type: 'mouseMove', x, y, button: 'left', modifiers: [...modifiers, 'leftbuttondown'] })
    }
    await pause()
    wc.sendInputEvent({ type: 'mouseUp', x: to[0], y: to[1], button: 'left', clickCount: 1, modifiers })
  })
  const script = automation
  if (script) {
    win?.webContents.on('console-message', (e) => console.log(`[renderer] ${e.message}`))
    win?.webContents.once('did-finish-load', () => {
      void win?.webContents.executeJavaScript(readFileSync(script, 'utf8')).catch((e) => console.error('automation failed', e))
    })
  }
}

app.whenReady().then(async () => {
  if (app.isPackaged) await adoptLoginShellPath()
  store.load()
  // the page needs notifications and nothing else the browser could grant
  const allowed = (permission: string): boolean => permission === 'notifications'
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(allowed(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed(permission))
  // a built Kuna.app has its icon; running from source, the Dock shows Electron's otherwise
  if (fromSource) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  registerIpc()
  buildMenu()
  createWindow()
  registerAutomation()
  app.on('activate', () => {
    if (!win) createWindow()
  })
})

// Quitting only disconnects; agents keep running in tmux on their hosts.
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  ptys.dispose()
  agents.dispose()
})
