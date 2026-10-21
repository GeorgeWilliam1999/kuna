import { updateSettings } from '../store'

const DEFAULT = { left: 280, right: 300 }
const MIN = { left: 200, right: 220 }

/** Drag handle on the inner edge of the sidebar (left) or the inspector (right). Double-click resets. */
export function Splitter({ side }: { side: 'left' | 'right' }): React.JSX.Element {
  const set = (w: number): void => updateSettings(side === 'left' ? { sidebarWidth: w } : { inspectorWidth: w })

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events have no pointer to capture */
    }
    document.body.classList.add('resizing')
    let frame = 0
    const move = (ev: PointerEvent): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const w = side === 'left' ? ev.clientX : window.innerWidth - ev.clientX
        set(Math.round(Math.max(MIN[side], Math.min(w, window.innerWidth * 0.45))))
      })
    }
    const up = (): void => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      document.body.classList.remove('resizing')
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <div
      className={`splitter splitter-${side}`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => set(DEFAULT[side])}
      title="Drag to resize · double-click to reset"
    />
  )
}
