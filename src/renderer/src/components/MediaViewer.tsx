import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { plotComment } from '@shared/input'
import { viewerOrder } from '@shared/media'
import type { MediaItem, MediaPage } from '@shared/types'
import { sendToAgent } from '../actions'
import { agentTitle, ago, bytes } from '../format'
import { loadMarkdownImages, renderDiagrams, renderMarkdown } from '../markdown'
import { useKuna } from '../store'
import { closeOverlay, useOverlayKeys } from './Overlays'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_PDF_PAGES = 60
/** space around a fitted plot */
const PAD = 28
/** a small image is shown at most this much enlarged when fitted (zooming goes further) */
const MAX_FIT_UPSCALE = 2
const MIN_ZOOM = 0.2
const MAX_ZOOM = 16
/** largest canvas side in device pixels; past it a page is stretched rather than re-rendered */
const MAX_CANVAS = 8192

interface Loaded {
  path: string
  url?: string
  data?: Uint8Array
  /** a Markdown file, rendered and sanitised */
  html?: string
  error?: string
}

interface PdfDoc {
  doc: pdfjs.PDFDocumentProxy
  /** page sizes in points */
  sizes: { w: number; h: number }[]
  total: number
}

const stampOf = (it: MediaItem): string => `${it.mtime}:${it.size}`
const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/**
 * PDF pages at `scale` CSS pixels per point. Pages are re-rendered for the
 * screen's pixel ratio once the scale settles; until then the previous bitmap
 * is stretched, so zooming stays smooth.
 */
function PdfPages({ pdf, scale }: { pdf: PdfDoc; scale: number }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let cancelled = false
    const tasks: pdfjs.RenderTask[] = []
    const timer = setTimeout(async () => {
      const dpr = window.devicePixelRatio || 1
      const canvases = [...el.querySelectorAll('canvas')]
      for (let i = 0; i < canvases.length && !cancelled; i++) {
        const page = await pdf.doc.getPage(i + 1)
        const { w, h } = pdf.sizes[i]
        const vp = page.getViewport({ scale: Math.min(scale * dpr, MAX_CANVAS / Math.max(w, h)) })
        const off = document.createElement('canvas')
        off.width = Math.floor(vp.width)
        off.height = Math.floor(vp.height)
        const task = page.render({ canvas: off, viewport: vp })
        tasks.push(task)
        try {
          await task.promise
        } catch {
          return
        }
        if (cancelled) return
        const c = canvases[i]
        c.width = off.width
        c.height = off.height
        c.getContext('2d')?.drawImage(off, 0, 0)
      }
    }, 90)
    return () => {
      cancelled = true
      clearTimeout(timer)
      for (const t of tasks) t.cancel()
    }
  }, [pdf, scale])

  return (
    <div className="pdf-pages" ref={host}>
      {pdf.sizes.map((s, i) => (
        <canvas key={i} className="pdf-page" style={{ width: s.w * scale, height: s.h * scale }} />
      ))}
      {pdf.total > pdf.sizes.length && (
        <p className="dim">
          Showing the first {pdf.sizes.length} of {pdf.total} pages. Press O to open the full file.
        </p>
      )}
    </div>
  )
}

export function MediaViewer({ agentKey }: { agentKey: string }): React.JSX.Element {
  const agent = useKuna((s) => s.agents[agentKey])
  const details = useKuna((s) => s.details[agentKey])
  const host = agent?.host
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [next, setNext] = useState<MediaPage['next']>(null)
  const [busy, setBusy] = useState<string | null>('Looking at the latest reply…')
  const [index, setIndex] = useState(0)
  const [file, setFile] = useState<Loaded | null>(null)
  const [pdf, setPdf] = useState<PdfDoc | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [stageSize, setStageSize] = useState({ w: 1200, h: 800 })
  const [zoom, setZoom] = useState(1)
  const rel = (p: string): string => (agent && p.startsWith(agent.cwd + '/') ? p.slice(agent.cwd.length + 1) : p)
  const stage = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const mdRoot = useRef<HTMLElement>(null)
  const anchor = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null)
  // a comment on the plot in view, sent to the agent
  const commentBox = useRef<HTMLTextAreaElement>(null)
  const [comment, setComment] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  /** Load pages until something new turns up (or nothing is left), and append it. */
  const loadMore = useCallback(
    /** returns where the first new file landed (-1: none) */
    async (page: NonNullable<MediaPage['next']> | Record<string, never>, have: MediaItem[]): Promise<number> => {
      let p: MediaPage['next'] | Record<string, never> = page
      let fresh: MediaItem[] = []
      while (p && !fresh.length) {
        setBusy('scan' in p ? 'Scanning the folder for plots…' : 'before' in p ? 'Looking at earlier replies…' : 'Looking at the latest reply…')
        const res = await window.kuna.media.list(agentKey, p)
        const seen = new Set(have.map((it) => it.path))
        fresh = res.items.filter((it) => !seen.has(it.path))
        p = res.next
        // nothing in the conversation at all: go straight to the folder scan
        if (!fresh.length && !p) break
      }
      setNext((p as MediaPage['next']) ?? null)
      setBusy(null)
      // PDFs stay ahead of all images, also as more turn up
      const all = viewerOrder([...have, ...fresh])
      setItems(all)
      return all.indexOf(fresh[0])
    },
    [agentKey]
  )

  const refresh = useCallback(async () => {
    setItems(null)
    setIndex(0)
    await loadMore({}, [])
  }, [loadMore])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const current = items?.[index]

  // the file itself, and the next one in the background
  useEffect(() => {
    if (!current || !host) return
    let url: string | undefined
    let cancelled = false
    setFile({ path: current.path })
    setPdf(null)
    setNatural(null)
    setZoom(1)
    void window.kuna.media.fetch(host, current.path, stampOf(current)).then((res) => {
      if (cancelled) return
      if ('error' in res) return setFile({ path: current.path, error: res.error })
      if (current.kind === 'pdf') return setFile({ path: current.path, data: res.data })
      if (current.kind === 'md') {
        setFile({ path: current.path, html: renderMarkdown(new TextDecoder().decode(res.data)) })
        const after = items?.[index + 1]
        if (after) void window.kuna.media.fetch(host, after.path, stampOf(after))
        return
      }
      url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: res.mime }))
      setFile({ path: current.path, url })
      const after = items?.[index + 1]
      if (after) void window.kuna.media.fetch(host, after.path, stampOf(after))
    })
    stage.current?.scrollTo(0, 0)
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, host])

  useEffect(() => {
    if (!file?.data) return
    let cancelled = false
    const task = pdfjs.getDocument({ data: file.data.slice() })
    void task.promise
      .then(async (doc) => {
        const sizes: PdfDoc['sizes'] = []
        for (let i = 1; i <= Math.min(doc.numPages, MAX_PDF_PAGES); i++) {
          const v = (await doc.getPage(i)).getViewport({ scale: 1 })
          sizes.push({ w: v.width, h: v.height })
        }
        if (!cancelled) setPdf({ doc, sizes, total: doc.numPages })
        const after = items?.[index + 1]
        if (after && host) void window.kuna.media.fetch(host, after.path, stampOf(after))
      })
      .catch((e: unknown) => !cancelled && setFile((f) => (f ? { ...f, error: `Could not render this PDF: ${String(e)}` } : f)))
    return () => {
      cancelled = true
      void task.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.data])

  // the pictures and diagrams of a Markdown file, once it is on screen
  useEffect(() => {
    const root = mdRoot.current
    if (file?.html == null || !root || !host) return
    let live = true
    const urls: string[] = []
    const keep = (u: string[]): void => {
      if (live) urls.push(...u)
      else u.forEach((x) => URL.revokeObjectURL(x))
    }
    void loadMarkdownImages(root, host, file.path, () => live).then(keep)
    void renderDiagrams(root, () => live).then(keep)
    return () => {
      live = false
      urls.forEach((x) => URL.revokeObjectURL(x))
    }
  }, [file?.html, file?.path, host])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // size at zoom 1: the whole plot (first page of a PDF) fits the window
  const base = pdf ? pdf.sizes[0] : natural
  const fit = base ? Math.min((stageSize.w - 2 * PAD) / base.w, (stageSize.h - 2 * PAD) / base.h, pdf ? Infinity : MAX_FIT_UPSCALE) : 1
  const scale = fit * zoom

  /** Zoom by `factor`, keeping the point under (x, y) (default: the middle) where it is. */
  const zoomAt = useCallback((factor: number, x?: number, y?: number) => {
    const st = stage.current
    const c = content.current
    if (st && c) {
      const sr = st.getBoundingClientRect()
      const cr = c.getBoundingClientRect()
      const px = x ?? sr.left + sr.width / 2
      const py = y ?? sr.top + sr.height / 2
      anchor.current = { fx: (px - cr.left) / cr.width, fy: (py - cr.top) / cr.height, x: px - sr.left, y: py - sr.top }
    }
    setZoom((z) => clampZoom(z * factor))
  }, [])

  useLayoutEffect(() => {
    const a = anchor.current
    const st = stage.current
    const c = content.current
    anchor.current = null
    if (!a || !st || !c) return
    st.scrollLeft = c.offsetLeft + a.fx * c.offsetWidth - a.x
    st.scrollTop = c.offsetTop + a.fy * c.offsetHeight - a.y
  }, [zoom])

  // pinch on the trackpad (and ⌘/Ctrl + wheel) zooms; plain scrolling pans
  const zoomRef = useRef(zoomAt)
  zoomRef.current = zoomAt
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomRef.current(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const st = stage.current
    // Markdown is text to select, not a picture to pan
    if (e.button !== 0 || !st || current?.kind === 'md') return
    const start = { x: e.clientX, y: e.clientY, left: st.scrollLeft, top: st.scrollTop }
    try {
      st.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events have no pointer to capture */
    }
    st.classList.add('panning')
    const move = (ev: PointerEvent): void => {
      st.scrollLeft = start.left - (ev.clientX - start.x)
      st.scrollTop = start.top - (ev.clientY - start.y)
    }
    const up = (): void => {
      st.removeEventListener('pointermove', move)
      st.removeEventListener('pointerup', up)
      st.classList.remove('panning')
    }
    st.addEventListener('pointermove', move)
    st.addEventListener('pointerup', up)
  }

  const older = async (): Promise<void> => {
    if (!items) return
    if (index < items.length - 1) return setIndex(index + 1)
    if (!next || busy) return
    // new files show next, even a PDF that sorts in ahead of the images
    const at = await loadMore(next, items)
    if (at >= 0) setIndex(at)
  }

  const sendComment = async (): Promise<void> => {
    const text = comment.trim()
    if (!text || !current || sending) return
    setSending(true)
    setNote(null)
    const failed = await sendToAgent(agentKey, plotComment(rel(current.path), text))
    setSending(false)
    if (failed) return setNote(`Not sent: ${failed}`)
    setComment('')
    setNote(`Sent to ${agent ? agentTitle(agent, details) : 'the agent'}${agent?.status === 'working' ? ' (it reads it after this turn)' : ''}.`)
    commentBox.current?.focus()
  }

  useEffect(() => {
    const el = commentBox.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(110, el.scrollHeight)}px`
  }, [comment])

  const save = async (): Promise<void> => {
    if (!current || !host) return
    const res = await window.kuna.media.save(host, current.path, stampOf(current))
    setNote('error' in res ? res.error : `Saved to Downloads as ${res.file.split('/').pop()}`)
  }

  const escAt = useRef(0)
  const [escHint, setEscHint] = useState(false)

  /**
   * Typing goes straight into the comment, Enter sends it. While it has text
   * the arrows move between its letters; with nothing typed they browse and
   * scroll, and Space and Esc close the viewer. With a comment, Space is a
   * space and Esc Esc discards it. Zoom and the rest are ⌘ keys, as in Preview.
   */
  useOverlayKeys((ev) => {
    const n = items?.length ?? 0
    const box = commentBox.current
    const inBox = document.activeElement === box
    if (ev.metaKey && !ev.ctrlKey) {
      switch (ev.key) {
        case '+':
        case '=':
          zoomAt(1.25)
          return true
        case '-':
          zoomAt(0.8)
          return true
        case '0':
          setZoom(1)
          return true
        case '1':
          // actual pixels of an image; 100% (96 dpi) for a PDF
          if (current?.kind === 'md') setZoom(1)
          else if (fit) zoomAt((pdf ? 96 / 72 : 1) / fit / zoom)
          return true
        case 'c':
          return false // copies what is selected (in a Markdown file, say)
        case 'o':
          if (current && host) void window.kuna.media.openExternal(host, current.path, stampOf(current))
          return true
        case 's':
          void save()
          return true
        case 'r':
          void refresh()
          return true
      }
      return inBox ? false : true // ⌘A, ⌘V, ⌘⌫ … edit the comment
    }
    // writing a comment: the arrows move between its letters
    if (inBox && comment && ev.key.startsWith('Arrow')) return false
    switch (ev.key) {
      case 'ArrowRight':
        void older()
        return true
      case 'ArrowLeft':
        if (n) setIndex((i) => Math.max(0, i - 1))
        return true
      case 'ArrowDown':
        stage.current?.scrollBy({ top: 160 })
        return true
      case 'ArrowUp':
        stage.current?.scrollBy({ top: -160 })
        return true
      case 'PageDown':
        stage.current?.scrollBy({ top: (stage.current?.clientHeight ?? 400) * 0.9 })
        return true
      case 'PageUp':
        stage.current?.scrollBy({ top: -(stage.current?.clientHeight ?? 400) * 0.9 })
        return true
      case 'Enter':
        if (ev.shiftKey && inBox) return false // a new line in the comment
        void sendComment()
        return true
      case 'Escape': {
        if (!comment) return false // closes the viewer
        const now = Date.now()
        if (now - escAt.current < 500) {
          setComment('')
          setEscHint(false)
          escAt.current = 0
        } else {
          escAt.current = now
          setEscHint(true)
          setTimeout(() => setEscHint(false), 520)
        }
        return true
      }
      case ' ':
        if (!comment) {
          closeOverlay()
          return true
        }
        break
    }
    if (inBox) return false // the textarea takes it
    // not focused (after a click on the plot): type into it from here
    if (ev.key === 'Backspace') {
      setComment((c) => c.slice(0, -1))
      box?.focus()
      return true
    }
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && box && !box.disabled) {
      setComment((c) => c + ev.key)
      box.focus()
      return true
    }
    return false
  })

  // the comment box has the keyboard from the start
  useEffect(() => {
    commentBox.current?.focus()
  }, [])

  const ready = file?.path === current?.path

  return (
    <div className="media-overlay">
      <header className="media-head">
        <span className="media-count">{items ? (items.length ? `${index + 1} / ${items.length}${next ? '+' : ''}` : '0') : '…'}</span>
        <span className="media-name">{current ? rel(current.path).split('/').pop() : 'Plots, PDFs & Markdown'}</span>
        {current && <span className="media-path">{rel(current.path)}</span>}
        <span className="ph-spacer" />
        {busy && items && <span className="media-meta">{busy}</span>}
        {current && (
          <span className="media-meta">
            {ago(current.mtime)} ago · {bytes(current.size)} ·{' '}
            {current.kind === 'md' ? `${Math.round(zoom * 100)}%` : zoom === 1 ? 'fit' : `${zoom < 1 ? zoom.toFixed(2) : zoom.toFixed(1)}×`}
          </span>
        )}
        <span className="media-keys">
          {comment ? '← → move in the comment · Enter sends · Esc Esc discards' : '← → files · type to comment · pinch or ⌘+ ⌘− zoom · ⌘0 fit · ⌘O open · ⌘S save · Space close'}
        </span>
        {current && (
          <button
            className="media-save"
            title="Save a copy in your Downloads folder (⌘S)"
            onMouseDown={(e) => e.preventDefault()} // the comment box keeps the keyboard
            onClick={() => void save()}
          >
            Save to Downloads
          </button>
        )}
      </header>
      <div
        className={`media-stage ${base && (base.w * scale > stageSize.w || base.h * scale > stageSize.h) ? 'can-pan' : ''}`}
        ref={stage}
        onPointerDown={onPointerDown}
        onDoubleClick={(e) => current?.kind !== 'md' && (zoom === 1 ? zoomAt(2.5, e.clientX, e.clientY) : setZoom(1))}
      >
        {!items && <div className="media-msg">{busy}</div>}
        {items && !items.length && !busy && (
          <div className="media-msg">
            No plots, PDFs or Markdown files yet. Kuna looks at the paths in the agent's replies, newest first, and then at files written in its
            folder since it started.
          </div>
        )}
        {ready && file?.error && <div className="media-msg">{file.error}</div>}
        {current && ready && (file?.url || pdf || file?.html != null) && (
          <div className="zoom-area" style={{ padding: PAD }}>
            <div className="zoom-content" ref={content}>
              {file?.url && (
                <img
                  className="media-img"
                  src={file.url}
                  alt={current.path}
                  draggable={false}
                  onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 800, h: e.currentTarget.naturalHeight || 600 })}
                  style={
                    natural
                      ? { width: natural.w * scale, height: natural.h * scale, imageRendering: scale >= 4 ? 'pixelated' : 'auto' }
                      : { visibility: 'hidden' }
                  }
                />
              )}
              {pdf && <PdfPages pdf={pdf} scale={scale} />}
              {file?.html != null && <article className="md media-md" ref={mdRoot} style={{ zoom }} dangerouslySetInnerHTML={{ __html: file.html }} />}
            </div>
          </div>
        )}
      </div>
      <div className={`media-comment ${commenting ? 'on' : ''}`}>
        <textarea
          ref={commentBox}
          rows={1}
          value={comment}
          spellCheck={false}
          disabled={sending || !current}
          placeholder={current ? `Type a comment on ${rel(current.path).split('/').pop()} — Enter sends it to the agent` : 'Nothing to comment on yet'}
          onChange={(e) => (setComment(e.target.value), setNote(null))}
          onFocus={() => setCommenting(true)}
          onBlur={() => setCommenting(false)}
        />
        <span className="mc-note">
          {sending
            ? 'Sending…'
            : escHint
              ? 'Esc again discards the comment'
              : (note ?? (comment ? 'Enter sends · ⇧Enter new line · Esc Esc discards' : ''))}
        </span>
      </div>
      {items && items.length > 1 && (
        <nav className="media-strip">
          {items.map((it, i) => (
            <button key={it.path} className={i === index ? 'on' : ''} onClick={() => setIndex(i)} title={it.path}>
              <span className={`kind kind-${it.kind}`}>{it.kind === 'image' ? 'img' : it.kind}</span>
              {it.path.split('/').pop()}
            </button>
          ))}
          {next && (
            <button onClick={() => void older()} className="dim">
              {'scan' in next ? 'scan folder →' : 'earlier replies →'}
            </button>
          )}
        </nav>
      )}
    </div>
  )
}
