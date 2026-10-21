import type { SshHostEntry } from './types'

export interface SshConfigSource {
  /** Read a file; return null when missing. */
  read(path: string): string | null
  /** Expand a glob from an Include directive into concrete paths. */
  glob(pattern: string): string[]
  home: string
}

/**
 * Collect concrete host aliases from an OpenSSH client config.
 * Wildcard patterns (`Host *`, `Host *.cern.ch`) are skipped because you
 * cannot connect to them directly.
 */
export function parseSshConfig(src: SshConfigSource, path = `${src.home}/.ssh/config`): SshHostEntry[] {
  const hosts = new Map<string, SshHostEntry>()
  const seen = new Set<string>()

  const visit = (file: string): void => {
    if (seen.has(file)) return
    seen.add(file)
    const text = src.read(file)
    if (text == null) return
    let current: SshHostEntry[] = []
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/(^|\s)#.*$/, '').trim()
      if (!line) continue
      const m = /^(\S+)\s*(?:=\s*|\s+)(.*)$/.exec(line)
      if (!m) continue
      const key = m[1].toLowerCase()
      const value = m[2].trim().replace(/^"(.*)"$/, '$1')
      if (key === 'host') {
        current = []
        for (const alias of value.split(/\s+/)) {
          if (!alias || /[*?!]/.test(alias)) continue
          const entry = hosts.get(alias) ?? { alias }
          hosts.set(alias, entry)
          current.push(entry)
        }
      } else if (key === 'match') {
        current = []
      } else if (key === 'include') {
        for (const pattern of value.split(/\s+/)) {
          const abs = pattern.startsWith('~')
            ? src.home + pattern.slice(1)
            : pattern.startsWith('/')
              ? pattern
              : `${src.home}/.ssh/${pattern}`
          for (const f of src.glob(abs)) visit(f)
        }
      } else if (current.length) {
        for (const entry of current) {
          if (key === 'hostname' && !entry.hostName) entry.hostName = value
          if (key === 'user' && !entry.user) entry.user = value
          if (key === 'proxyjump' && !entry.proxyJump) entry.proxyJump = value
        }
      }
    }
  }

  visit(path)
  return [...hosts.values()]
}
