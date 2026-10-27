/** Several Kuna windows: their order for ⌘← ⌘→ and where a new or restored one goes. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowSpot {
  id: number
  bounds: Rect
  /** when it was opened (any increasing number) */
  opened: number
}

/**
 * The order ⌘← ⌘→ walk through: left to right by the window's left edge, then
 * top to bottom, then the order they were opened (windows in the same place,
 * e.g. each full screen on its own Space).
 */
export function windowOrder(windows: WindowSpot[]): number[] {
  return [...windows].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y || a.opened - b.opened).map((w) => w.id)
}

/** The window `dir` steps from `id` in `order`, wrapping around; null when there is no other one. */
export function stepWindow(order: number[], id: number, dir: -1 | 1): number | null {
  const i = order.indexOf(id)
  if (i < 0 || order.length < 2) return null
  return order[(i + dir + order.length) % order.length]
}

const CASCADE = 28

/** A new window: the size of the one it was opened from, a step down and to the right, back at the top left of the screen when that runs off it. */
export function cascade(from: Rect, area: Rect): Rect {
  const width = Math.min(from.width, area.width)
  const height = Math.min(from.height, area.height)
  let x = from.x + CASCADE
  let y = from.y + CASCADE
  if (x + width > area.x + area.width || y + height > area.y + area.height) {
    x = area.x
    y = area.y
  }
  return { x, y, width, height }
}

/**
 * A saved window back where it was if that is still on a screen (enough of its
 * top edge to drag it by); otherwise its size, centred on the main screen.
 */
export function placeOnScreen(saved: Rect, areas: Rect[], main: Rect): Rect {
  const grip = (a: Rect): number => {
    const w = Math.min(saved.x + saved.width, a.x + a.width) - Math.max(saved.x, a.x)
    const top = saved.y >= a.y && saved.y < a.y + a.height - 20
    return top ? w : 0
  }
  if (areas.some((a) => grip(a) >= 100)) return saved
  const width = Math.min(saved.width, main.width)
  const height = Math.min(saved.height, main.height)
  return { x: Math.round(main.x + (main.width - width) / 2), y: Math.round(main.y + (main.height - height) / 2), width, height }
}
