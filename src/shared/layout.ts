/**
 * Pane grid: how many panes go in each row for `n` open tabs. Rows fill from
 * the top and a new pane goes below, then splits the bottom row:
 * 1 → [1], 2 → [2] (vertical split), 3 → [2,1], 4 → [2,2], 5 → [3,2], 7 → [3,3,1] ...
 */
export function gridRows(n: number): number[] {
  if (n <= 0) return []
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  return Array.from({ length: rows }, (_, r) => (r < rows - 1 ? cols : n - cols * (rows - 1)))
}

export interface Cell {
  row: number
  col: number
}

export function cellOf(rows: number[], index: number): Cell {
  let i = index
  for (let r = 0; r < rows.length; r++) {
    if (i < rows[r]) return { row: r, col: i }
    i -= rows[r]
  }
  return { row: rows.length - 1, col: Math.max(0, rows[rows.length - 1] - 1) }
}

export function indexOf(rows: number[], cell: Cell): number {
  let i = 0
  for (let r = 0; r < cell.row; r++) i += rows[r]
  return i + cell.col
}

export type Direction = 'left' | 'right' | 'up' | 'down'

/**
 * Where an arrow key goes from pane `index`. Returns another pane index,
 * `'sidebar'` when leaving the grid on the left, or `null` at an edge.
 */
export function neighbor(rows: number[], index: number, dir: Direction): number | 'sidebar' | null {
  if (!rows.length) return dir === 'left' ? 'sidebar' : null
  const { row, col } = cellOf(rows, index)
  switch (dir) {
    case 'left':
      return col === 0 ? 'sidebar' : indexOf(rows, { row, col: col - 1 })
    case 'right':
      return col + 1 < rows[row] ? indexOf(rows, { row, col: col + 1 }) : null
    case 'up':
    case 'down': {
      const target = dir === 'up' ? row - 1 : row + 1
      if (target < 0 || target >= rows.length) return null
      const center = (col + 0.5) / rows[row]
      const tcol = Math.min(rows[target] - 1, Math.floor(center * rows[target]))
      return indexOf(rows, { row: target, col: tcol })
    }
  }
}
