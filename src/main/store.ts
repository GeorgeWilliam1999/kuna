import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { PersistedState } from '@shared/types'

const DEFAULT_STATE: PersistedState = {
  version: 1,
  projects: [],
  settings: { theme: 'cherenkov', inspector: true, sidebarWidth: 280, notify: true },
  lastSeen: {}
}

/**
 * Projects, folders and UI preferences, stored as one JSON file in userData.
 * Written atomically; the version from before this launch is kept as
 * `kuna-state.json.bak`, and a file that can't be read is set aside instead
 * of being overwritten.
 */
export class Store {
  state: PersistedState = DEFAULT_STATE
  private backedUp = false

  // resolved lazily: userData may be redirected (KUNA_USER_DATA) after construction
  private get file(): string {
    return join(app.getPath('userData'), 'kuna-state.json')
  }

  load(): PersistedState {
    if (existsSync(this.file)) {
      try {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<PersistedState>
        this.state = {
          ...DEFAULT_STATE,
          ...parsed,
          settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
          lastSeen: parsed.lastSeen ?? {}
        }
      } catch (e) {
        const aside = `${this.file}.unreadable-${Date.now()}`
        console.error(`kuna: could not read state, starting fresh (kept as ${aside})`, e)
        try {
          renameSync(this.file, aside)
        } catch {
          /* leave it */
        }
      }
    }
    return this.state
  }

  save(next: PersistedState): void {
    this.state = next
    if (!this.backedUp && existsSync(this.file)) {
      copyFileSync(this.file, `${this.file}.bak`)
      this.backedUp = true
    }
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(next, null, 2))
    renameSync(tmp, this.file)
  }
}
