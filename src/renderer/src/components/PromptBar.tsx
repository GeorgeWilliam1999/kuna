import { useEffect, useMemo, useRef } from 'react'
import { targetFolder } from '../actions'
import { DEFAULT_BACKEND, splitBackendPrefix } from '@shared/backends'
import { refreshBackends, set, useKuna } from '../store'
import { buildTree } from '../tree'
import { TexText } from './TexText'

/** The "new agent" composer under the sidebar. Enter launches an agent in the target folder. */
export function PromptBar(): React.JSX.Element {
  const zone = useKuna((s) => s.zone)
  const prompt = useKuna((s) => s.prompt)
  const sel = useKuna((s) => s.sel)
  const projects = useKuna((s) => s.projects)
  const agents = useKuna((s) => s.agents)
  const hosts = useKuna((s) => s.hosts)
  const escHint = useKuna((s) => s.escHint)
  const backends = useKuna((s) => s.backends)
  const ref = useRef<HTMLTextAreaElement>(null)
  const active = zone === 'prompt'

  // the agent starts in the folder of the selected row, wherever the arrows went while typing
  const target = useMemo(() => {
    const node = buildTree(projects, Object.values(agents), hosts).find((n) => n.id === sel)
    const t = targetFolder(node)
    if (!t) return null
    const project = projects.find((p) => p.id === t!.projectId)
    const folder = project?.folders.find((f) => f.id === t!.folderId)
    return project && folder ? { project, folder } : null
  }, [sel, projects, agents, hosts])

  // which agent Enter starts: `@id` at the start of the prompt, else the project's
  const agent = useMemo(() => {
    if (!target) return undefined
    const id = splitBackendPrefix(prompt, backends).backend ?? target.project.backend ?? DEFAULT_BACKEND
    return id === DEFAULT_BACKEND ? undefined : (backends.find((b) => b.id === id)?.name ?? `@${id}`)
  }, [prompt, backends, target])

  useEffect(() => {
    if (active) void refreshBackends()
  }, [active])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (active) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    } else el.blur()
  }, [active])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(220, el.scrollHeight)}px`
  }, [prompt])

  return (
    <div className={`promptbar ${active ? 'active' : ''}`}>
      <div className="prompt-target">
        {target ? (
          <>
            <span className="swatch" style={{ background: target.folder.color }} />
            <span className="pt-folder">
              <TexText text={target.folder.name} />
            </span>
            <span className="pt-host">{target.project.host === 'local' ? 'this mac' : target.project.host}</span>
          </>
        ) : (
          <span className="pt-none">Select a folder to launch agents</span>
        )}
        {agent && <span className="pt-agent">{agent}</span>}
      </div>
      <textarea
        ref={ref}
        rows={2}
        value={prompt}
        spellCheck={false}
        placeholder={target ? 'Type to start a new agent here…' : ''}
        onChange={(e) => set({ prompt: e.target.value })}
        onFocus={() => {
          if (zone !== 'prompt') set({ zone: 'prompt', mode: 'insert' })
        }}
      />
      <div className="prompt-hint">
        {escHint
          ? 'Esc again to discard'
          : prompt
            ? 'Enter starts it · ← → move in the text · ↑ ↓ pick the folder · ⇧Enter new line · Esc Esc discards'
            : 'Start typing with a folder selected'}
      </div>
    </div>
  )
}
