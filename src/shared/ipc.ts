import type {
  AgentDetails,
  AgentRuntime,
  ClaudeFileEntry,
  FontPrefs,
  HostId,
  HostState,
  MediaPage,
  PlanUsage,
  PersistedState,
  SpawnRequest,
  SshHostEntry
} from './types'

/** The API exposed to the renderer as `window.kuna`. */
export interface KunaApi {
  platform: string
  state: {
    load(): Promise<PersistedState>
    save(state: PersistedState): Promise<void>
    /** synchronous save, for when the window is closing */
    saveNow(state: PersistedState): void
  }
  ssh: {
    hosts(): Promise<SshHostEntry[]>
  }
  /** fonts from the user's VS Code and iTerm2 settings */
  fonts(): Promise<FontPrefs>
  hosts: {
    /** Make sure we watch exactly these hosts. */
    watch(hosts: HostId[]): Promise<void>
    reconnect(host: HostId): Promise<void>
    onState(cb: (states: HostState[]) => void): () => void
  }
  agents: {
    spawn(req: SpawnRequest): Promise<{ key: string } | { error: string }>
    /** Kill a Kuna agent; stop (or, once stopped, remove) a Claude background session. */
    kill(key: string): Promise<{ error?: string; stopped?: boolean }>
    respawn(key: string): Promise<{ error?: string }>
    /** Agents currently in view; only their transcripts are followed. */
    interest(keys: string[]): void
    key(key: string, keys: string[]): Promise<void>
    /** Type a line into a Kuna (tmux) agent and press Enter. */
    send(key: string, text: string): Promise<{ error?: string }>
    onUpdate(cb: (agents: AgentRuntime[]) => void): () => void
    details(key: string): Promise<AgentDetails | null>
    onDetails(cb: (key: string, details: AgentDetails) => void): () => void
  }
  usage: {
    get(): Promise<PlanUsage | null>
    onUpdate(cb: (usage: PlanUsage | null) => void): () => void
  }
  pty: {
    /** Attach a terminal to an agent's tmux session. */
    attach(key: string, cols: number, rows: number): Promise<string>
    /** Interactive `ssh <host>` used to sign in when keys are not enough. */
    login(host: HostId, cols: number, rows: number): Promise<string>
    write(ptyId: string, data: string): void
    resize(ptyId: string, cols: number, rows: number): void
    close(ptyId: string): void
    onData(cb: (ptyId: string, data: string) => void): () => void
    onExit(cb: (ptyId: string, code: number) => void): () => void
  }
  media: {
    /** the latest reply's plots; `before` an earlier reply's, `scan` the folder scan */
    list(key: string, page?: { before?: number; scan?: boolean }): Promise<MediaPage>
    fetch(host: HostId, path: string, stamp?: string): Promise<{ data: Uint8Array; mime: string } | { error: string }>
    openExternal(host: HostId, path: string, stamp?: string): Promise<void>
    /** a copy in ~/Downloads (renamed "x (1).pdf" if taken): its path, or why not */
    save(host: HostId, path: string, stamp?: string): Promise<{ file: string } | { error: string }>
  }
  claude: {
    list(host: HostId, cwds: string[]): Promise<ClaudeFileEntry[]>
    read(host: HostId, path: string): Promise<string>
  }
  /** the clipboard's text (⌘V where no text field has the caret) */
  clipboardText(): Promise<string>
  copyText(text: string): void
  /** show or hide the macOS close/minimize/zoom buttons (only over the sidebar) */
  windowButtons(visible: boolean): void
  fs: {
    dirs(host: HostId, dir: string): Promise<string[]>
    /** path → physical path (symlinks resolved) for the directories that exist */
    realPaths(host: HostId, paths: string[]): Promise<Record<string, string>>
  }
}

export const IPC = {
  stateLoad: 'state:load',
  stateSave: 'state:save',
  stateSaveSync: 'state:save-sync',
  sshHosts: 'ssh:hosts',
  fonts: 'app:fonts',
  hostsWatch: 'hosts:watch',
  hostsReconnect: 'hosts:reconnect',
  hostsState: 'hosts:state',
  agentsSpawn: 'agents:spawn',
  agentsKill: 'agents:kill',
  agentsRespawn: 'agents:respawn',
  agentsInterest: 'agents:interest',
  agentsKey: 'agents:key',
  agentsSend: 'agents:send',
  agentsUpdate: 'agents:update',
  agentsDetails: 'agents:details',
  agentsDetailsUpdate: 'agents:details-update',
  usageGet: 'usage:get',
  usageUpdate: 'usage:update',
  ptyAttach: 'pty:attach',
  ptyLogin: 'pty:login',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyClose: 'pty:close',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  mediaList: 'media:list',
  mediaFetch: 'media:fetch',
  mediaOpen: 'media:open',
  mediaSave: 'media:save',
  claudeList: 'claude:list',
  claudeRead: 'claude:read',
  fsDirs: 'fs:dirs',
  fsRealPaths: 'fs:real-paths',
  clipboardText: 'clipboard:text',
  copyText: 'clipboard:write',
  windowButtons: 'window:buttons'
} as const
