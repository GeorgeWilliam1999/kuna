import type { Project } from './types'

/**
 * Rearranging the sidebar by hand (drag and drop, ⇧↑ ⇧↓): projects and
 * folders keep their order in the saved state; agents placed by hand are
 * listed, in order, in their folder's `agents`, which wins over where Kuna
 * would put them by itself.
 */

export type DropWhere = 'before' | 'after' | 'into'

export type RowRef =
  | { kind: 'project'; projectId: string; host: string }
  | { kind: 'folder'; projectId: string; folderId: string; host: string; virtual?: boolean }
  | { kind: 'agent'; projectId: string; folderId: string; host: string; key: string }

/** What dropping `drag` on `target` does, or null when it can't go there. `upper`: the pointer is over the top half of the row. */
export function dropPlan(drag: RowRef, target: RowRef, upper: boolean): DropWhere | null {
  const side: DropWhere = upper ? 'before' : 'after'
  if (drag.kind === 'project') return target.kind === 'project' && target.projectId !== drag.projectId ? side : null
  // folders and agents stay on their host: a path means nothing elsewhere
  if (drag.host !== target.host) return null
  if (drag.kind === 'folder') {
    if (drag.virtual) return null
    if (target.kind === 'project') return 'into'
    if (target.kind === 'folder' && !target.virtual && !(target.projectId === drag.projectId && target.folderId === drag.folderId)) return side
    return null
  }
  if (target.kind === 'folder') return 'into'
  if (target.kind === 'agent' && target.key !== drag.key) return side
  return null
}

function insertAt<T>(list: T[], item: T, at: number): T[] {
  return [...list.slice(0, at), item, ...list.slice(at)]
}

/** `id` moved before or after `targetId`. */
export function moveProjectTo(projects: Project[], id: string, targetId: string, where: 'before' | 'after'): Project[] {
  const moving = projects.find((p) => p.id === id)
  if (!moving || id === targetId) return projects
  const rest = projects.filter((p) => p.id !== id)
  const at = rest.findIndex((p) => p.id === targetId)
  if (at < 0) return projects
  return insertAt(rest, moving, where === 'before' ? at : at + 1)
}

/** A folder moved before/after another folder, or to the end of a project (`targetFolderId` null). */
export function moveFolderTo(
  projects: Project[],
  fromProjectId: string,
  folderId: string,
  toProjectId: string,
  targetFolderId: string | null,
  where: DropWhere
): Project[] {
  const folder = projects.find((p) => p.id === fromProjectId)?.folders.find((f) => f.id === folderId)
  const to = projects.find((p) => p.id === toProjectId)
  if (!folder || !to || folderId === targetFolderId) return projects
  return projects.map((p) => {
    let folders = p.folders.filter((f) => !(p.id === fromProjectId && f.id === folderId))
    if (p.id === toProjectId) {
      const at = targetFolderId ? folders.findIndex((f) => f.id === targetFolderId) : -1
      folders = at < 0 ? [...folders, folder] : insertAt(folders, folder, where === 'before' ? at : at + 1)
    }
    return folders === p.folders ? p : { ...p, folders }
  })
}

/**
 * An agent placed by hand: taken out of every folder's list and put into the
 * target folder's, before/after `targetKey` or at the end. `shown` is what the
 * target folder shows now, in order; its list becomes that order with the
 * agent in it, so the rest keep their places. `toFolderId` null ("Other
 * agents"): only taken out, and Kuna places it by itself again.
 */
export function placeAgent(
  projects: Project[],
  key: string,
  toProjectId: string,
  toFolderId: string | null,
  shown: string[],
  targetKey: string | null,
  where: DropWhere
): Project[] {
  return projects.map((p) => ({
    ...p,
    folders: p.folders.map((f) => {
      let list = (f.agents ?? []).filter((k) => k !== key)
      if (p.id === toProjectId && f.id === toFolderId) {
        list = shown.filter((k) => k !== key)
        const at = targetKey ? list.indexOf(targetKey) : -1
        list = at < 0 ? [...list, key] : insertAt(list, key, where === 'before' ? at : at + 1)
      }
      if (list.length) return { ...f, agents: list }
      if (!f.agents) return f
      const rest = { ...f }
      delete rest.agents
      return rest
    })
  }))
}

/** Forget agents that are gone, once their host has reported a full list without them. */
export function pruneArranged(projects: Project[], live: Set<string>, complete: (host: string) => boolean): Project[] {
  let changed = false
  const next = projects.map((p) => {
    if (!complete(p.host)) return p
    return {
      ...p,
      folders: p.folders.map((f) => {
        if (!f.agents?.some((k) => !live.has(k))) return f
        changed = true
        const agents = f.agents.filter((k) => live.has(k))
        if (agents.length) return { ...f, agents }
        const rest = { ...f }
        delete rest.agents
        return rest
      })
    }
  })
  return changed ? next : projects
}
