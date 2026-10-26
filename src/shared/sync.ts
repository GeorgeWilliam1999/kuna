import type { PersistedState, Project, SharedState } from './types'

/** The shared part of a saved state. */
export function sharedOf(s: PersistedState): SharedState {
  return {
    projects: s.projects,
    settings: s.settings,
    lastSeen: s.lastSeen,
    hostnames: s.hostnames ?? {},
    hidden: s.hidden ?? {},
    names: s.names ?? {}
  }
}

/** Keys set to a new value and keys removed. */
export interface RecordPatch<T> {
  set?: Record<string, T>
  del?: string[]
}

/**
 * A change one window made to what all windows share, for the main process to
 * save and the other windows to apply. Records change key by key, so two
 * windows changing different keys at once both keep their change; the
 * projects are replaced whole.
 */
export interface SharedPatch {
  projects?: Project[]
  settings?: RecordPatch<unknown>
  lastSeen?: RecordPatch<number>
  hostnames?: RecordPatch<string>
  hidden?: RecordPatch<number>
  names?: RecordPatch<string>
}

const RECORDS = ['settings', 'lastSeen', 'hostnames', 'hidden', 'names'] as const
type RecordField = (typeof RECORDS)[number]

function diffRecord<T>(prev: Record<string, T>, next: Record<string, T>): RecordPatch<T> | undefined {
  if (prev === next) return undefined
  const set: Record<string, T> = {}
  const del: string[] = []
  for (const [k, v] of Object.entries(next)) if (prev[k] !== v && v !== undefined) set[k] = v
  for (const k of Object.keys(prev)) if (next[k] === undefined && prev[k] !== undefined) del.push(k)
  if (!Object.keys(set).length && !del.length) return undefined
  return { ...(Object.keys(set).length ? { set } : {}), ...(del.length ? { del } : {}) }
}

/** What changed from `prev` to `next`; null when nothing did. */
export function diffShared(prev: SharedState, next: SharedState): SharedPatch | null {
  const patch: SharedPatch = {}
  if (prev.projects !== next.projects) patch.projects = next.projects
  for (const f of RECORDS) {
    const d = diffRecord(prev[f] as Record<string, unknown>, next[f] as Record<string, unknown>)
    if (d) (patch as Record<RecordField, RecordPatch<unknown>>)[f] = d
  }
  return Object.keys(patch).length ? patch : null
}

function mergeRecord<T>(a: RecordPatch<T> | undefined, b: RecordPatch<T> | undefined): RecordPatch<T> | undefined {
  if (!a || !b) return a ?? b
  const set = { ...a.set }
  for (const k of b.del ?? []) delete set[k]
  Object.assign(set, b.set)
  const del = [...(a.del ?? []).filter((k) => !(b.set && k in b.set)), ...(b.del ?? []).filter((k) => !(a.del ?? []).includes(k))]
  return { ...(Object.keys(set).length ? { set } : {}), ...(del.length ? { del } : {}) }
}

/** One patch with the effect of `a` followed by `b`. */
export function mergePatch(a: SharedPatch, b: SharedPatch): SharedPatch {
  const patch: SharedPatch = {}
  const projects = b.projects ?? a.projects
  if (projects) patch.projects = projects
  for (const f of RECORDS) {
    const m = mergeRecord(a[f] as RecordPatch<unknown> | undefined, b[f] as RecordPatch<unknown> | undefined)
    if (m) (patch as Record<RecordField, RecordPatch<unknown>>)[f] = m
  }
  return patch
}

function applyRecord<T>(rec: Record<string, T>, p: RecordPatch<T> | undefined): Record<string, T> {
  if (!p) return rec
  const next = { ...rec }
  for (const k of p.del ?? []) delete next[k]
  return Object.assign(next, p.set)
}

/** The shared state with a patch applied; fields the patch leaves alone keep their identity. */
export function applyPatch(state: SharedState, patch: SharedPatch): SharedState {
  return {
    projects: patch.projects ?? state.projects,
    settings: applyRecord(state.settings as unknown as Record<string, unknown>, patch.settings) as unknown as SharedState['settings'],
    lastSeen: applyRecord(state.lastSeen, patch.lastSeen),
    hostnames: applyRecord(state.hostnames, patch.hostnames),
    hidden: applyRecord(state.hidden, patch.hidden),
    names: applyRecord(state.names, patch.names)
  }
}
