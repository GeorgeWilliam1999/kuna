import { BrowserWindow, screen, type WebContents } from 'electron'
import { IPC, type WindowCommand } from '@shared/ipc'
import type { WindowLayout, WindowsInfo } from '@shared/types'
import { cascade, placeOnScreen, stepWindow, windowOrder, type Rect } from '@shared/windows'

interface Entry {
  win: BrowserWindow
  wc: WebContents
  opened: number
  /** its panes as it last reported them; bounds while closed */
  layout: WindowLayout
  /** the sidebar row it opens with (a new window: the one selected where it was opened from) */
  sel?: string | null
  closed: boolean
}

export interface WindowsOptions {
  /** a new BrowserWindow at these bounds (default size, centred, without), loading the page */
  make(bounds: Rect | undefined, fullScreen: boolean): BrowserWindow
  /** something to save changed: which windows there are, their panes or their place */
  changed(): void
  /** a window closed (its terminals go) */
  closed(wc: WebContents): void
  /** scripted runs: never take the focus from what the user is doing */
  quiet: boolean
}

/**
 * Kuna's windows. Each has its own panes; the sidebar is the same in all of
 * them (see docs/adr/0001-one-renderer-per-window.md). Keeps the order ⌘← ⌘→
 * walk, which window has which agent's pane, and which windows come back at
 * the next launch: all that were open at quit, or the last one closed.
 */
export class Windows {
  private entries: Entry[] = []
  /** open windows, most recently focused first */
  private used: Entry[] = []
  private seq = 0
  private quitting = false
  private infoTimer?: NodeJS.Timeout
  private moveTimer?: NodeJS.Timeout

  constructor(private opts: WindowsOptions) {}

  private get open(): Entry[] {
    return this.entries.filter((e) => !e.closed)
  }

  private entry(wc: WebContents): Entry | undefined {
    return this.entries.find((e) => e.wc === wc && !e.closed)
  }

  /** A window: a saved one with its panes and place, or a new one cascaded from `from`. */
  create(layout: WindowLayout = { tabs: [] }, sel?: string | null, from?: BrowserWindow): BrowserWindow {
    let bounds: Rect | undefined
    if (from) {
      const b = from.getNormalBounds()
      bounds = cascade(b, screen.getDisplayMatching(b).workArea)
    } else if (layout.bounds) {
      bounds = placeOnScreen(
        layout.bounds,
        screen.getAllDisplays().map((d) => d.workArea),
        screen.getPrimaryDisplay().workArea
      )
    }
    const win = this.opts.make(bounds, !from && !!layout.fullScreen)
    const e: Entry = { win, wc: win.webContents, opened: ++this.seq, layout: { ...layout }, sel, closed: false }
    this.entries.push(e)
    this.used.push(e)
    win.on('focus', () => {
      this.used = [e, ...this.used.filter((x) => x !== e)]
      this.sendInfoSoon()
    })
    win.on('blur', () => this.sendInfoSoon())
    const moved = (): void => {
      clearTimeout(this.moveTimer)
      this.moveTimer = setTimeout(() => {
        this.sendInfo()
        this.opts.changed()
      }, 400)
    }
    win.on('moved', moved)
    win.on('resize', moved)
    win.on('enter-full-screen', moved)
    win.on('leave-full-screen', moved)
    win.on('close', () => {
      e.layout = { ...e.layout, bounds: win.getNormalBounds(), fullScreen: win.isFullScreen() }
    })
    win.on('closed', () => {
      e.closed = true
      this.used = this.used.filter((x) => x !== e)
      // a window closed by hand is forgotten; at quit, or the last one, it comes back next time
      if (!this.quitting && this.open.length) this.entries = this.entries.filter((x) => x !== e)
      this.opts.closed(e.wc)
      this.sendInfo()
      this.opts.changed()
    })
    this.sendInfoSoon()
    this.opts.changed()
    return win
  }

  /** The windows from the last quit (none saved: one new window). */
  restore(saved: WindowLayout[]): void {
    if (!saved.length) this.create()
    for (const l of saved) this.create(l)
  }

  /** Quitting: every window closing from now on comes back at the next launch. */
  quit(): void {
    this.quitting = true
  }

  /** What to save: the windows to bring back, in the order they were opened. */
  saved(): WindowLayout[] {
    return this.entries.map((e) =>
      e.closed || e.win.isDestroyed() ? e.layout : { ...e.layout, bounds: e.win.getNormalBounds(), fullScreen: e.win.isFullScreen() }
    )
  }

  /** What a window starts from: its panes and selection (the shared state comes from the store). */
  boot(wc: WebContents): { layout?: WindowLayout; sel?: string | null } {
    const e = this.entry(wc)
    return e ? { layout: e.layout, sel: e.sel } : {}
  }

  /** A window reported its panes. */
  setLayout(wc: WebContents, layout: WindowLayout): void {
    const e = this.entry(wc)
    if (!e) return
    const before = e.layout.tabs
    e.layout = { ...e.layout, tabs: layout.tabs, focus: layout.focus, sidebarHidden: layout.sidebarHidden }
    if (before.join('\n') !== layout.tabs.join('\n')) this.sendInfo()
  }

  /** The window used last, which opens what a notification or the menu asks for. */
  lastUsed(): BrowserWindow | undefined {
    return this.used[0]?.win
  }

  broadcast(channel: string, ...args: unknown[]): void {
    for (const e of this.open) if (!e.wc.isDestroyed()) e.wc.send(channel, ...args)
  }

  sendOthers(wc: WebContents, channel: string, ...args: unknown[]): void {
    for (const e of this.open) if (e.wc !== wc && !e.wc.isDestroyed()) e.wc.send(channel, ...args)
  }

  private command(e: Entry, cmd: WindowCommand): void {
    if (!e.wc.isDestroyed()) e.wc.send(IPC.windowCommand, cmd)
  }

  private order(): Entry[] {
    const open = this.open
    const ids = windowOrder(open.map((e) => ({ id: e.opened, bounds: e.win.getBounds(), opened: e.opened })))
    return ids.map((id) => open.find((e) => e.opened === id)!)
  }

  private neighbour(wc: WebContents, dir: -1 | 1): Entry | undefined {
    const from = this.entry(wc)
    const order = this.order()
    const id = from ? stepWindow(order.map((e) => e.opened), from.opened, dir) : null
    return order.find((e) => e.opened === id)
  }

  private focus(e: Entry): void {
    if (e.win.isMinimized()) e.win.restore()
    if (!this.opts.quiet) e.win.focus()
    else {
      this.used = [e, ...this.used.filter((x) => x !== e)]
      this.sendInfoSoon()
    }
  }

  /** ⌘← ⌘→: the previous / next window. */
  step(wc: WebContents, dir: -1 | 1): boolean {
    const to = this.neighbour(wc, dir)
    if (!to) return false
    this.focus(to)
    this.command(to, { kind: 'arrive' })
    return true
  }

  /** ⌥⌘← ⌥⌘→: the agent's pane goes to the previous / next window, and the focus with it. */
  carry(wc: WebContents, key: string, dir: -1 | 1): boolean {
    const from = this.entry(wc)
    const to = this.neighbour(wc, dir)
    if (!from || !to) return false
    // the target must not see the pane as open here any more when it opens it
    from.layout = { ...from.layout, tabs: from.layout.tabs.filter((k) => k !== key) }
    this.sendInfo()
    this.focus(to)
    this.command(to, { kind: 'adopt', key })
    return true
  }

  /** Opening an agent that has a pane in another window goes there. */
  reveal(wc: WebContents, key: string): boolean {
    const to = this.open.find((e) => e.wc !== wc && e.layout.tabs.includes(key))
    if (!to) return false
    this.focus(to)
    this.command(to, { kind: 'focus', key })
    return true
  }

  /** The agent was stopped from another window: its pane closes wherever it is. */
  closePane(wc: WebContents, key: string): void {
    for (const e of this.open) if (e.wc !== wc && e.layout.tabs.includes(key)) this.command(e, { kind: 'close', key })
  }

  /** The New Window menu item: the window used last opens it (with its selection). */
  newFromMenu(): void {
    const e = this.used[0]
    if (e) this.command(e, { kind: 'new-window' })
    else this.create()
  }

  /** The n-th window in the order they were opened (scripted runs). */
  nth(n: number): WebContents | undefined {
    return this.open[n]?.wc
  }

  /** Tell every window about the others again (one just loaded, and missed what was said before). */
  sendInfoSoon(): void {
    clearTimeout(this.infoTimer)
    // focus moves as a blur and a focus: report once both have happened
    this.infoTimer = setTimeout(() => this.sendInfo(), 20)
  }

  private sendInfo(): void {
    clearTimeout(this.infoTimer)
    const order = this.order()
    const focused = BrowserWindow.getFocusedWindow()
    const anyFocused = order.some((e) => e.win === focused)
    for (const e of order) {
      const elsewhere: Record<string, true> = {}
      for (const o of order) if (o !== e) for (const k of o.layout.tabs) elsewhere[k] = true
      const info: WindowsInfo = { index: order.indexOf(e), count: order.length, anyFocused, notifier: this.used[0] === e, elsewhere }
      if (!e.wc.isDestroyed()) e.wc.send(IPC.windowInfo, info)
    }
  }
}
