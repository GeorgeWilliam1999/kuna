import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, basename } from 'node:path'
import { parseSshConfig } from '@shared/sshConfig'
import type { SshHostEntry } from '@shared/types'

function globSimple(pattern: string): string[] {
  if (!/[*?]/.test(pattern)) return [pattern]
  const dir = dirname(pattern)
  const re = new RegExp(`^${basename(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
  try {
    return readdirSync(dir)
      .filter((f) => re.test(f))
      .sort()
      .map((f) => `${dir}/${f}`)
  } catch {
    return []
  }
}

export function listSshHosts(): SshHostEntry[] {
  return parseSshConfig({
    home: homedir(),
    read: (p) => {
      try {
        return readFileSync(p, 'utf8')
      } catch {
        return null
      }
    },
    glob: globSimple
  })
}
