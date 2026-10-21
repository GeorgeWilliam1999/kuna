/**
 * Paths typed or pasted into the folder dialog.
 */

/** Repeated slashes collapse ("a//b" → "a/b"). */
export function cleanTypedPath(v: string): string {
  return v.replace(/\/{2,}/g, '/')
}

/**
 * A pasted path, as the user means it: quotes, a trailing newline and
 * "file://" dropped. An absolute or home path replaces what is in the field
 * (the field starts as "~/", and "~/" + "/project/…" is not what anyone wants);
 * anything else is inserted where the selection is.
 */
export function pastePath(field: string, pasted: string, selStart: number, selEnd: number): { value: string; caret: number } {
  let p = pasted.trim().replace(/^file:\/\//, '')
  if (/^(['"]).*\1$/.test(p)) p = p.slice(1, -1)
  if (p.startsWith('/') || p.startsWith('~')) {
    const value = cleanTypedPath(p)
    return { value, caret: value.length }
  }
  const value = cleanTypedPath(field.slice(0, selStart) + p + field.slice(selEnd))
  return { value, caret: Math.min(value.length, selStart + p.length) }
}
