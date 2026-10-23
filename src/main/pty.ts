import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'

interface Session {
  proc: pty.IPty
  buf: string
  timer?: NodeJS.Timeout
}

const FLUSH_MS = 6

/**
 * Local pseudo-terminals. Each open tab is one `ssh -tt host kuna attach <id>`
 * (or a local tmux attach). Closing a tab kills only this client process; the
 * agent keeps running inside tmux on the host.
 */
export class PtyService {
  private sessions = new Map<string, Session>()

  constructor(private target: () => WebContents | undefined) {}

  open(file: string, args: string[], cols: number, rows: number, onExit?: () => void): string {
    const id = randomBytes(6).toString('hex')
    const env = { ...process.env } as Record<string, string>
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'
    if (!env.LANG || !/utf-?8/i.test(env.LANG)) env.LANG = 'en_US.UTF-8'
    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(2, cols),
      rows: Math.max(2, rows),
      cwd: homedir(),
      env
    })
    const s: Session = { proc, buf: '' }
    this.sessions.set(id, s)

    // Coalesce bursts of output into one IPC message per few ms.
    proc.onData((d) => {
      s.buf += d
      if (!s.timer) {
        s.timer = setTimeout(() => {
          s.timer = undefined
          const out = s.buf
          s.buf = ''
          this.target()?.send('pty:data', id, out)
        }, FLUSH_MS)
      }
    })
    proc.onExit(({ exitCode }) => {
      onExit?.()
      if (s.timer) {
        clearTimeout(s.timer)
        if (s.buf) this.target()?.send('pty:data', id, s.buf)
      }
      this.sessions.delete(id)
      this.target()?.send('pty:exit', id, exitCode)
    })
    return id
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.proc.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id)
    if (!s || cols < 2 || rows < 2) return
    try {
      s.proc.resize(cols, rows)
    } catch {
      /* process already gone */
    }
  }

  close(id: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    this.sessions.delete(id)
    try {
      s.proc.kill()
    } catch {
      /* already exited */
    }
  }

  dispose(): void {
    for (const id of [...this.sessions.keys()]) this.close(id)
  }
}
