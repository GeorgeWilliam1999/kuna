import type { MediaItem } from './types'

const EXT = 'png|jpe?g|gif|webp|svg|pdf'

// A path-ish token ending in a media extension, preceded by a delimiter so
// URLs (`https://x/a.png`) and identifiers (`foo.png_bar`) are not matched.
const MEDIA_RE = new RegExp(
  String.raw`(?:^|[\s"'\x60(\[=:,>])((?:~|\.{1,2})?\/?(?:[\w@%+.,~-]+\/)*[\w@%+,~-][\w@%+.,~-]*\.(?:${EXT}))(?=$|[\s"'\x60)\],;:!?.<])`,
  'gi'
)

export function mediaKind(path: string): MediaItem['kind'] | null {
  const m = /\.([a-z0-9]+)$/i.exec(path)
  if (!m) return null
  const ext = m[1].toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'svg') return 'svg'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  return null
}

export function mimeFor(path: string): string {
  const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

/** Every media path mentioned in a piece of text, in order of appearance. */
export function extractMediaPaths(text: string): string[] {
  const out: string[] = []
  if (!text || text.length > 400_000) return out
  MEDIA_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MEDIA_RE.exec(text))) {
    out.push(m[1])
    // allow back-to-back matches separated by a single delimiter
    MEDIA_RE.lastIndex = m.index + m[0].length
  }
  return out
}

/** POSIX normalisation without touching the filesystem. Keeps a leading `~`. */
export function normalizePosix(path: string): string {
  const abs = path.startsWith('/')
  const parts: string[] = []
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (parts.length && parts[parts.length - 1] !== '..' && parts[parts.length - 1] !== '~') parts.pop()
      else if (!abs) parts.push('..')
      continue
    }
    parts.push(seg)
  }
  return (abs ? '/' : '') + parts.join('/')
}

/** Resolve a path mentioned by an agent against the agent's working directory. */
export function resolveAgainst(cwd: string, p: string): string {
  if (p.startsWith('/') || p === '~' || p.startsWith('~/')) return normalizePosix(p)
  return normalizePosix(`${cwd.replace(/\/+$/, '')}/${p}`)
}

/**
 * The order plots are shown in: PDFs first, then images, each in the order
 * given (the order a reply mentions them, left to right; newest first for
 * the folder scan).
 */
export function pdfsFirst<T extends { kind: string }>(items: T[]): T[] {
  return [...items.filter((it) => it.kind === 'pdf'), ...items.filter((it) => it.kind !== 'pdf')]
}
