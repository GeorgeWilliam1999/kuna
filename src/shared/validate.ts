/**
 * Checks on what the page sends the main process. The page is Kuna's own UI,
 * but everything it asks for turns into commands on hosts, so the main process
 * only accepts well-formed hosts, agent ids and keys (see SECURITY.md).
 */

/** "local", or an ssh alias that can't be read as an option or split into words. */
export function isHostId(id: unknown): id is string {
  return typeof id === 'string' && (id === 'local' || /^(?!-)[^\s\x00-\x1f\x7f]{1,255}$/.test(id))
}

/** Kuna's hex agent ids and background sessions' "cc-<short id>". */
export function isAgentId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)
}

/** "host::id" → its parts, or null when either is malformed. */
export function splitAgentKey(key: unknown): { host: string; id: string } | null {
  if (typeof key !== 'string') return null
  const i = key.lastIndexOf('::')
  if (i < 0) return null
  const host = key.slice(0, i)
  const id = key.slice(i + 2)
  return isHostId(host) && isAgentId(id) ? { host, id } : null
}

const KEY_NAMES = /^(Escape|Enter|Tab|BTab|BSpace|Up|Down|Left|Right|Home|End|PageUp|PageDown|C-[a-z]|[0-9])$/

/** Keys for `tmux send-keys`: plain key names, or leaving scroll mode (-X cancel). No other flags. */
export function isTmuxKeys(keys: unknown): keys is string[] {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 16) return false
  if (keys.length === 2 && keys[0] === '-X' && keys[1] === 'cancel') return true
  return keys.every((k) => typeof k === 'string' && KEY_NAMES.test(k))
}
