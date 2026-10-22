import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { mediaKind, resolveAgainst } from '@shared/media'

/**
 * Markdown an agent wrote, for the viewer. It can quote anything (a web page,
 * a log), so: no scripts, styles, forms or embeds; links open in the browser
 * (http/https only); pictures never load from the network, and relative ones
 * are marked `data-src` for `loadMarkdownImages` to fetch from the host.
 */
const purify = DOMPurify(window)
purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') ?? ''
    if (/^https?:\/\//i.test(href)) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noreferrer')
    } else node.removeAttribute('href')
  }
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') ?? ''
    if (/^data:image\//i.test(src)) return
    node.removeAttribute('src')
    if (src && !/^[a-z][a-z0-9+.-]*:/i.test(src)) node.setAttribute('data-src', src)
  }
})

const FORBID = {
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'link', 'meta'],
  FORBID_ATTR: ['style', 'srcset']
}

export function renderMarkdown(text: string): string {
  return purify.sanitize(marked.parse(text, { async: false }) as string, FORBID) as string
}

/**
 * Fill in the pictures a rendered file refers to, relative to the file, read
 * from its host through the viewer's own checks. Returns the blob URLs to revoke.
 */
export async function loadMarkdownImages(root: HTMLElement, host: string, mdPath: string, isLive: () => boolean): Promise<string[]> {
  const urls: string[] = []
  const dir = mdPath.replace(/\/[^/]*$/, '') || '/'
  const imgs = [...root.querySelectorAll<HTMLImageElement>('img[data-src]')].slice(0, 40)
  await Promise.all(
    imgs.map(async (img) => {
      let rel = img.dataset.src ?? ''
      try {
        rel = decodeURIComponent(rel.replace(/[?#].*$/, ''))
      } catch {
        return
      }
      const path = resolveAgainst(dir, rel)
      const kind = mediaKind(path)
      if (kind !== 'image' && kind !== 'svg') return
      const res = await window.kuna.media.fetch(host, path)
      if ('error' in res || !isLive()) return
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: res.mime }))
      urls.push(url)
      img.src = url
    })
  )
  return urls
}
