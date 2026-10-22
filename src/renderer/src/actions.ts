import { moveFolderTo, placeAgent } from '@shared/arrange'
import { CLEAR_INPUT, compactBlocker, hasInputBox, messageBlocker, screenState, type ScreenState } from '@shared/input'
import { gridRows, neighbor, type Direction } from '@shared/layout'
import type { AgentRuntime } from '@shared/types'
import { OTHER_FOLDER_ID, assignAgents, buildTree, folderOfAgent, type TreeNode } from './tree'
import { agentTitle } from './format'
import { arrange, get, hideAgent, markSeen, moveProject, set, toast, toggleCollapsed, toggleFolder, undoHide, unhideAgent } from './store'
import { disposeTerminal, reattach, screenLines, terminalEntry, writeToAgent, type TermEntry } from './terminals'

// ------------------------------------------------------------------ tree --

export function visibleTree(): TreeNode[] {
  const s = get()
  return buildTree(s.projects, Object.values(s.agents), s.hosts)
}

export function selectedNode(): TreeNode | undefined {
  const s = get()
  return visibleTree().find((n) => n.id === s.sel)
}

/** The folder a new agent would go into, given the sidebar selection. */
export function targetFolder(node = selectedNode()): { projectId: string; folderId: string } | null {
  if (!node) return null
  if (node.kind === 'project') {
    const f = node.project.folders[0]
    return f ? { projectId: node.project.id, folderId: f.id } : null
  }
  if (node.folder.id === OTHER_FOLDER_ID) return null
  return { projectId: node.project.id, folderId: node.folder.id }
}

/** ⇧↑ ⇧↓: move the selected project, folder or agent one place up or down among its neighbours. */
export function nudgeSelection(delta: -1 | 1): void {
  const s = get()
  const node = selectedNode()
  const where = delta < 0 ? 'before' : 'after'
  if (!node) return
  if (node.kind === 'project') return moveProject(node.project.id, delta)
  if (node.kind === 'folder') {
    const folders = node.project.folders
    const other = folders[folders.findIndex((f) => f.id === node.folder.id) + delta]
    if (!node.virtual && other) arrange(moveFolderTo(s.projects, node.project.id, node.folder.id, node.project.id, other.id, where))
    return
  }
  if (node.folder.id === OTHER_FOLDER_ID) return
  const shown = (assignAgents(s.projects, Object.values(s.agents), s.hosts).get(`${node.project.id}:${node.folder.id}`) ?? []).map((a) => a.key)
  const other = shown[shown.indexOf(node.agent.key) + delta]
  if (other) arrange(placeAgent(s.projects, node.agent.key, node.project.id, node.folder.id, shown, other, where))
}

export function moveSelection(delta: number): void {
  const nodes = visibleTree()
  if (!nodes.length) return
  const i = nodes.findIndex((n) => n.id === get().sel)
  const j = i < 0 ? 0 : Math.max(0, Math.min(nodes.length - 1, i + delta))
  set({ sel: nodes[j].id })
}

// ------------------------------------------------------------------ tabs --

export function focusedKey(): string | undefined {
  const s = get()
  return s.zone === 'pane' ? s.tabs[s.paneIndex] : undefined
}

/** The agent a command applies to: the focused pane, else the sidebar selection. */
export function activeAgentKey(): string | undefined {
  const s = get()
  if (s.zone === 'pane') return s.tabs[s.paneIndex]
  const node = selectedNode()
  return node?.kind === 'agent' ? node.agent.key : undefined
}

/**
 * Where the focus was when a tab was opened, as long as the user stays on
 * that tab: closing it (⌘W, or killing its agent) goes back there.
 */
let cameFrom: { key: string; zone: 'sidebar' | 'pane'; sel: string | null; paneKey?: string } | null = null

export function focusPane(index: number): void {
  const s = get()
  if (!s.tabs.length) return
  const i = Math.max(0, Math.min(s.tabs.length - 1, index))
  if (cameFrom && s.tabs[i] !== cameFrom.key) cameFrom = null
  set({ zone: 'pane', paneIndex: i, mode: 'nav', sidebarPeek: false, inspectorPeek: false })
  markSeen(s.tabs[i])
}

export function focusSidebar(): void {
  cameFrom = null
  set({ zone: 'sidebar', mode: 'nav' })
}

export function openTab(key: string, focus = true): void {
  const s = get()
  if (focus) {
    const paneKey = s.zone === 'pane' ? s.tabs[s.paneIndex] : undefined
    cameFrom = paneKey === key ? cameFrom : { key, zone: s.zone === 'pane' ? 'pane' : 'sidebar', sel: s.sel, paneKey }
  }
  const at = s.tabs.indexOf(key)
  if (at >= 0) {
    if (focus) focusPane(at)
    return
  }
  set({ tabs: [...s.tabs, key] })
  if (focus) focusPane(s.tabs.length)
}

export function closeTab(key: string): void {
  const s = get()
  const i = s.tabs.indexOf(key)
  if (i < 0) return
  disposeTerminal(key)
  const tabs = s.tabs.filter((k) => k !== key)
  const back = cameFrom?.key === key ? cameFrom : null
  cameFrom = null
  const paneIndex = Math.max(0, Math.min(s.paneIndex, tabs.length - 1))
  if (back?.zone === 'pane' && back.paneKey && tabs.includes(back.paneKey)) {
    // back to the pane it was opened from
    set({ tabs, zone: 'pane', mode: 'nav', paneIndex: tabs.indexOf(back.paneKey) })
  } else if (back?.zone === 'sidebar' || !tabs.length) {
    // back to the row it was opened from (a hidden sidebar slides in for it)
    const sel = back?.sel && visibleTree().some((n) => n.id === back.sel) ? back.sel : `a:${key}`
    set({ tabs, zone: 'sidebar', mode: 'nav', paneIndex, sel, sidebarPeek: s.sidebarHidden })
  } else set({ tabs, paneIndex, mode: 'nav' })
}

/** Swap two tabs (Shift+← →, or dropping one pane header on another), focusing the moved one. */
export function swapTabs(i: number, j: number): void {
  const s = get()
  if (i === j || i < 0 || j < 0 || i >= s.tabs.length || j >= s.tabs.length) return
  const tabs = [...s.tabs]
  ;[tabs[i], tabs[j]] = [tabs[j], tabs[i]]
  set({ tabs, paneIndex: j, zone: 'pane' })
}

/** ⌥+arrows on a pane: swap it with the pane that way; held ⌥, it keeps going. */
export function movePaneInGrid(dir: Direction): void {
  const s = get()
  const target = neighbor(gridRows(s.tabs.length), s.paneIndex, dir)
  if (typeof target === 'number') swapTabs(s.paneIndex, target)
}

export function moveInGrid(dir: Direction): void {
  const s = get()
  const target = neighbor(gridRows(s.tabs.length), s.paneIndex, dir)
  if (target === 'sidebar') {
    // a hidden sidebar slides in until the way back
    if (s.sidebarHidden) set({ sidebarPeek: true })
    const key = s.tabs[s.paneIndex]
    // land on the agent we came from if it is visible in the tree
    if (key && visibleTree().some((n) => n.id === `a:${key}`)) set({ sel: `a:${key}` })
    focusSidebar()
  } else if (target != null) focusPane(target)
  // past the rightmost pane: a hidden right panel slides in, until ← or Esc
  else if (dir === 'right' && !s.settings.inspector) set({ inspectorPeek: true })
}

// ---------------------------------------------------------------- typing --

export function enterInsert(initial?: string): void {
  const key = focusedKey()
  if (!key) return
  const e = terminalEntry(key)
  if (!e) return
  if (!e.ptyId) {
    reattach(key)
    return
  }
  e.typed = 0
  set({ mode: 'insert' })
  e.term.focus()
  const send = (): void => {
    if (!initial) return
    writeToAgent(key, initial)
    e.typed += initial.length
  }
  // leave tmux scroll mode first, or the keys would drive tmux instead of the agent
  const leaving = leaveScroll(key)
  if (leaving) void leaving.then(send)
  else send()
}

/**
 * Leave tmux's scroll mode (after the wheel or PageUp) before keys meant for
 * the agent, which it would otherwise take as its own; null when not in it.
 */
export function leaveScroll(key: string): Promise<void> | null {
  const a = get().agents[key]
  const e = terminalEntry(key)
  if (a?.kind !== 'tmux' || !e) return null
  // the host reports scroll mode a moment late: just left it is out of it
  const reported = a.inCopyMode && Date.now() - (e.leftScroll ?? 0) > 2000
  if (!reported && !e.paged) return null
  e.paged = false
  e.leftScroll = Date.now()
  return window.kuna.agents.key(key, ['-X', 'cancel']).then(
    () => undefined,
    () => undefined
  )
}

export function leaveInsert(clear: boolean): void {
  const key = focusedKey()
  const e = key ? terminalEntry(key) : undefined
  if (e && clear && e.typed > 0) {
    // End, then erase what this typing session added to the agent's input box
    writeToAgent(e.key, '\x1b[F' + '\x7f'.repeat(Math.min(e.typed, 4000)))
  }
  if (e) {
    e.typed = 0
    e.term.blur()
  }
  set({ mode: 'nav' })
}

// ---------------------------------------------------------------- agents --

export async function spawnAgent(projectId: string, folderId: string, prompt: string, resumeSessionId?: string): Promise<string | undefined> {
  // size the tmux window like the pane it will most likely land in
  const s = get()
  const rows = gridRows(s.tabs.length + 1)
  const main = document.querySelector('.panes') as HTMLElement | null
  const w = main?.clientWidth ?? 1200
  const h = main?.clientHeight ?? 800
  const cols = Math.floor(w / rows[rows.length - 1] / 8.2)
  const lines = Math.floor(h / rows.length / 17) - 2
  const res = await window.kuna.agents.spawn({ projectId, folderId, prompt, cols, rows: lines, resumeSessionId })
  if ('error' in res) {
    toast(res.error, 'error')
    return
  }
  openTab(res.key, false)
  set({ sel: `a:${res.key}` })
  return res.key
}

/**
 * ⌘R: rename what is selected (or the agent in the focused pane): a project,
 * a folder, or an agent (a name of your own, kept by Kuna).
 */
export function renameSelection(): void {
  const s = get()
  if (s.mode === 'insert' && s.zone === 'pane') leaveInsert(false)
  if (s.zone === 'pane') {
    const key = s.tabs[s.paneIndex]
    if (key) set({ overlay: { kind: 'agent-rename', key }, mode: 'nav' })
    return
  }
  const node = selectedNode()
  if (!node) return
  if (node.kind === 'project') set({ overlay: { kind: 'project', editId: node.project.id }, mode: 'nav' })
  else if (node.kind === 'folder') {
    if (!node.virtual) set({ overlay: { kind: 'folder-edit', projectId: node.project.id, folderId: node.folder.id }, mode: 'nav' })
  } else set({ overlay: { kind: 'agent-rename', key: node.agent.key }, mode: 'nav' })
}

/**
 * ⇧⌘R on an exited agent (crashed, /exit, or the node rebooted): start
 * `claude --resume <session>` in the same folder and drop the dead entry.
 */
export async function resumeAgent(): Promise<void> {
  const key = activeAgentKey()
  const s = get()
  const a = key ? s.agents[key] : undefined
  if (!key || !a) return
  if (a.kind === 'claude') {
    if (!a.alive) {
      openTab(key) // attaching brings a stopped background session back
      return
    }
    const res = await window.kuna.agents.respawn(key)
    toast(res.error ?? 'Respawned on the current Claude Code version.', res.error ? 'error' : 'info')
    return
  }
  if (a.alive) {
    toast('This agent is still running.', 'warn')
    return
  }
  const sessionId = s.details[key]?.sessionId ?? a.sessionId
  const where = folderOfAgent(s.projects, Object.values(s.agents), s.hosts).get(key)
  if (!sessionId || !where || where.folder.id === OTHER_FOLDER_ID) {
    toast('Kuna does not know which conversation or folder to resume this agent in.', 'warn')
    return
  }
  const wasOpen = s.tabs.includes(key)
  const next = await spawnAgent(where.project.id, where.folder.id, '', sessionId)
  if (!next) return
  await killAgent(key)
  if (wasOpen) openTab(next)
  toast('Resumed the conversation in a new agent.')
}

const KILL_ARM_MS = 1600

/** Agents being killed: hidden right away, before the host confirms. */
export const killing = new Set<string>()

/** Ctrl+X: first press arms, second press within 1.6 s kills. */
export function killRequest(): void {
  const key = activeAgentKey()
  if (!key) return
  const s = get()
  const now = Date.now()
  if (s.armedKill && s.armedKill.key === key && s.armedKill.until > now) {
    set({ armedKill: null })
    void killAgent(key)
    return
  }
  set({ armedKill: { key, until: now + KILL_ARM_MS } })
  setTimeout(() => {
    if (get().armedKill?.key === key && get().armedKill!.until <= Date.now() + 10) set({ armedKill: null })
  }, KILL_ARM_MS + 20)
}

/** ⌘Z: bring back the session taken off the list last. */
export function restoreHidden(): void {
  const key = undoHide()
  if (!key) return toast('Nothing to bring back.', 'info')
  set({ sel: `a:${key}`, zone: 'sidebar', mode: 'nav' })
  toast('Back on the list (stopped: Enter opens it again).')
}

export async function killAgent(key: string): Promise<void> {
  const s = get()
  const agent = s.agents[key]
  if (agent?.kind === 'claude') return stopOrRemoveSession(key)
  const wasFocused = s.zone === 'pane' && s.tabs[s.paneIndex] === key
  if (s.tabs.includes(key)) closeTab(key)
  // keep the sidebar cursor near where it was
  if (s.sel === `a:${key}`) {
    const nodes = visibleTree()
    const i = nodes.findIndex((n) => n.id === s.sel)
    const next = nodes[i + 1]?.kind === 'agent' ? nodes[i + 1] : nodes[i - 1]
    if (next) set({ sel: next.id })
  }
  killing.add(key)
  const agents = { ...get().agents }
  delete agents[key]
  set({ agents })
  if (wasFocused && !get().tabs.length) focusSidebar()
  try {
    await window.kuna.agents.kill(key)
  } finally {
    setTimeout(() => killing.delete(key), 5000)
  }
}

/**
 * Claude background sessions: stop it (`claude stop`, the conversation is
 * kept) and take it off the list, no questions. ⌘Z brings it back, and so does
 * reviving it from `claude agents`; Kuna never deletes one (`claude rm`).
 */
async function stopOrRemoveSession(key: string): Promise<void> {
  const s = get()
  const a = s.agents[key]
  if (!a) return
  const label = agentTitle(a, s.details[key])
  if (s.tabs.includes(key)) closeTab(key)
  if (s.sel === `a:${key}`) {
    const nodes = visibleTree()
    const i = nodes.findIndex((n) => n.id === s.sel)
    const near = nodes[i + 1]?.kind === 'agent' ? nodes[i + 1] : nodes[i - 1]
    if (near) set({ sel: near.id })
  }
  hideAgent(key)
  const agents = { ...get().agents }
  delete agents[key]
  set({ agents })
  const res = a.alive ? await window.kuna.agents.kill(key) : {}
  if (res.error) {
    unhideAgent(key)
    toast(`Could not stop “${label}”: ${res.error}`, 'error')
    return
  }
  toast(`${a.alive ? 'Stopped' : 'Removed'} “${label}” from the list. Its conversation is kept: ⌘Z brings it back.`)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Wait until a tab is attached, its screen has stopped redrawing and shows
 * Claude Code's input box. Returns why not otherwise; nothing is typed then.
 * `whileBusy`: a running turn is fine (the spinner never stops redrawing, so
 * the input box under it is enough once the screen has had a moment).
 */
async function readyTerminal(key: string, timeoutMs: number, whileBusy = false): Promise<TermEntry | string> {
  const start = Date.now()
  let seen: ScreenState = 'unknown'
  while (Date.now() - start < timeoutMs) {
    const e = terminalEntry(key)
    // a new tab gets its terminal on the next render
    if (e?.disposed || (!e && Date.now() - start > 3000) || !get().tabs.includes(key)) return 'Its tab was closed; nothing was typed.'
    const quiet = Date.now() - (e?.lastData ?? 0) > 700
    if (e?.ptyId && e.gotData && (quiet || (whileBusy && Date.now() - start > 1500))) {
      const lines = screenLines(key)
      seen = screenState(lines)
      if (seen === 'input' || (whileBusy && seen === 'busy' && hasInputBox(lines))) return e
    }
    await sleep(250)
  }
  if (seen === 'question') return 'It is waiting for you. Answer it first.'
  if (seen === 'busy') return 'It is in the middle of a turn. Compact it once it is idle.'
  return 'Its input box did not show up, so nothing was typed.'
}

/** Type a line into an attached tab in place of whatever is in its input box, then press Enter. */
async function typeLine(e: TermEntry, text: string): Promise<void> {
  writeToAgent(e.key, CLEAR_INPUT)
  e.typed = 0
  await sleep(120)
  writeToAgent(e.key, text)
  // Enter on its own, so Claude Code takes it as a key press and not as part of a paste
  await sleep(150)
  writeToAgent(e.key, '\r')
}

/**
 * Type a line into the agent as if typed in its input box and sent; returns
 * why it couldn't. Kuna agents without a tab get it through tmux; background
 * sessions only take input through `claude attach`, so their tab is opened.
 * `whileBusy`: a message, which Claude Code queues during a turn (a slash
 * command like /compact waits for an idle agent instead).
 */
async function typeIntoAgent(key: string, a: AgentRuntime, text: string, whileBusy: boolean): Promise<string | undefined> {
  // leave tmux scroll mode first, or the keys would drive tmux instead of the agent
  if (a.kind === 'tmux' && a.inCopyMode) await window.kuna.agents.key(key, ['-X', 'cancel'])
  const open = terminalEntry(key)
  if (!open?.ptyId && a.kind === 'tmux') {
    // no tab: tmux types it (and clears the input box first)
    return (await window.kuna.agents.send(key, text)).error
  }
  if (!open) openTab(key, false)
  else if (!open.ptyId) reattach(key)
  // background sessions take input only through `claude attach`, which can
  // take a while to come up on a busy node
  const e = await readyTerminal(key, open?.ptyId ? 5000 : 90_000, whileBusy)
  if (typeof e === 'string') return e
  // things may have moved on while it attached
  const now = get().agents[key]
  if (!now) return 'It is gone.'
  const blocked = whileBusy ? messageBlocker(now) : compactBlocker(now)
  if (blocked) return blocked
  await typeLine(e, text)
  return undefined
}

const ON_A_QUESTION = 'A question or permission prompt is on its screen; Enter would answer it. Answer it first.'

/**
 * Paste a message into the agent and send it (Claude Code queues it if it is
 * mid-turn); returns why it couldn't. An open tab gets it right away, whatever
 * the status says; the screen is what counts: only a question or permission
 * prompt on it stops it, since the Enter would answer that.
 */
export async function sendToAgent(key: string, text: string): Promise<string | undefined> {
  try {
    const a = get().agents[key]
    const open = terminalEntry(key)
    if (open?.ptyId) {
      if (a?.kind === 'tmux' && a.inCopyMode) await window.kuna.agents.key(key, ['-X', 'cancel'])
      if (screenState(screenLines(key)) === 'question') return ON_A_QUESTION
      await typeLine(open, text)
      return undefined
    }
    if (!a) return 'It is gone.'
    if (a.kind === 'tmux') {
      if (a.status === 'waiting') return ON_A_QUESTION
      if (a.inCopyMode) await window.kuna.agents.key(key, ['-X', 'cancel'])
      return (await window.kuna.agents.send(key, text)).error
    }
    // a background session without a tab: open it (attaching brings a stopped
    // one back) and paste once its input box is there
    if (!open) openTab(key, false)
    else reattach(key)
    const e = await readyTerminal(key, 90_000, true)
    if (typeof e === 'string') return e
    if (screenState(screenLines(key)) === 'question') return ON_A_QUESTION
    await typeLine(e, text)
    return undefined
  } catch (err) {
    return String(err)
  }
}

/**
 * Run `/compact`: Claude summarizes the conversation and carries on from the
 * summary. Kuna agents get it typed by tmux; background sessions only take
 * input through `claude attach`, so their tab is opened first.
 */
export async function compactAgent(key: string): Promise<void> {
  const s = get()
  const a = s.agents[key]
  if (!a || s.compacting[key]) return
  const blocked = compactBlocker(a)
  if (blocked) {
    toast(blocked, 'warn')
    return
  }
  const label = agentTitle(a, s.details[key])
  const done = (): void => {
    const compacting = { ...get().compacting }
    delete compacting[key]
    set({ compacting })
  }
  set({ compacting: { ...s.compacting, [key]: true } })
  let failed: string | undefined
  try {
    failed = await typeIntoAgent(key, a, '/compact', false)
  } catch (err) {
    failed = String(err)
  }
  if (failed) {
    done()
    toast(`Could not compact “${label}”. ${failed}`, 'warn')
    return
  }
  toast(`Compacting “${label}”.`)
  // the status turns to working with the next watch frame; until then a second click would queue another
  setTimeout(done, 8000)
}

/** Interrupt: send Esc to the agent (Claude Code stops the current turn). */
/**
 * Esc for an agent, without delay. A lone Esc typed into tmux's client waits
 * half a second there (tmux 3.8, whatever escape-time says), so an agent in
 * tmux gets it with send-keys; a background session's `claude attach` reads it
 * straight away.
 */
export function sendEsc(key: string): void {
  if (get().agents[key]?.kind === 'claude') writeToAgent(key, '\x1b')
  else void window.kuna.agents.key(key, ['Escape'])
}

export function interruptAgent(): void {
  const key = activeAgentKey()
  if (!key) return
  sendEsc(key)
  toast('Sent Esc to the agent')
}

/** Enter on a row: projects and folders roll out or in, agents open. */
export function activateSelection(): void {
  const node = selectedNode()
  if (!node) return
  if (node.kind === 'project') toggleCollapsed(node.project.id)
  else if (node.kind === 'folder') toggleFolder(node.project.id, node.folder.id)
  else openTab(node.agent.key)
}

/** Enter with something typed: start an agent with it in the selected row's folder. */
export function launchDraft(): void {
  const s = get()
  const text = s.prompt
  if (!text.trim()) return
  const t = targetFolder()
  if (!t) {
    toast('Select a folder to start the agent in (arrows), then press Enter.', 'warn')
    return
  }
  set({ prompt: '', zone: 'sidebar', mode: 'nav' })
  void spawnAgent(t.projectId, t.folderId, text)
}
