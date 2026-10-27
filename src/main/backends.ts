import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { mergeBackends, type AgentBackend } from '@shared/backends'
import { parseJsonc } from '@shared/jsonc'

export interface BackendList {
  backends: AgentBackend[]
  /** entries of agents.json that were skipped, and why */
  errors: string[]
  file: string
}

const TEMPLATE = `// Agent backends for Kuna, on top of the built-in ones (claude, codex, gemini,
// opencode, aider, colibri, ollama). An entry with a built-in id replaces it.
// Start a prompt with @<id> to launch that agent once, or pick it for a
// project in Edit project. See docs/AGENTS.md.
{
  "agents": [
    // {
    //   "id": "gpu",
    //   "name": "Claude Code on the GPU box",
    //   "command": "claude",
    //   "env": { "ANTHROPIC_BASE_URL": "http://gpu01:8000", "ANTHROPIC_AUTH_TOKEN": "local", "ANTHROPIC_MODEL": "glm-5.2-colibri" }
    // },
    // { "id": "qwen", "name": "Qwen Code", "command": "qwen", "prompt": "-i" }
  ]
}
`

function file(): string {
  return join(app.getPath('userData'), 'agents.json')
}

/** Read on every call: the file is small and edits apply to the next launch without a restart. */
export function loadBackends(): BackendList {
  const f = file()
  if (!existsSync(f)) return { ...mergeBackends(undefined), file: f }
  try {
    return { ...mergeBackends(parseJsonc(readFileSync(f, 'utf8'))), file: f }
  } catch (e) {
    return { ...mergeBackends(undefined), errors: [`agents.json: ${(e as Error).message}`], file: f }
  }
}

/** Path of agents.json, written with a commented example first if it doesn't exist yet. */
export function backendsFile(): string {
  const f = file()
  if (!existsSync(f)) writeFileSync(f, TEMPLATE)
  return f
}
