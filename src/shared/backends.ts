/**
 * Agent backends: the CLIs Kuna can start in a folder. Claude Code is the one
 * Kuna knows best (hooks, transcripts, background sessions); any other agent
 * CLI runs in Kuna's tmux server and gets its status from the screen.
 *
 * Built-in backends cover the common CLIs. More come from `agents.json` in
 * Kuna's Application Support folder (see docs/AGENTS.md); an entry with the id
 * of a built-in one replaces it.
 */

export interface AgentBackend {
  /** lowercase word, used as `@id` at the start of a prompt */
  id: string
  name: string
  /** command line run through the login shell on the host, e.g. `codex --model o4-mini` */
  command: string
  /** variables set for the agent, e.g. ANTHROPIC_BASE_URL for a local model server */
  env?: Record<string, string>
  /**
   * How a prompt reaches the agent: `arg` appends it as the last argument
   * (default), a flag such as `-i` or `--prompt` puts it after that flag, and
   * `type` types it into the agent once it has started.
   */
  prompt?: 'arg' | 'type' | string
  /** it is Claude Code: Kuna adds its hooks, a session id and --resume */
  claude?: boolean
  /** one line shown when choosing a backend */
  note?: string
}

/** Stands for the project's own agent command (`claude` unless changed). */
export const DEFAULT_BACKEND = 'claude'

export const BUILTIN_BACKENDS: AgentBackend[] = [
  { id: 'claude', name: 'Claude Code', command: 'claude', claude: true, note: "the project's agent command" },
  { id: 'codex', name: 'Codex CLI', command: 'codex', note: 'OpenAI Codex; `--oss` runs it on Ollama' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', prompt: '-i' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', prompt: '--prompt', note: 'any provider, local models included' },
  { id: 'aider', name: 'Aider', command: 'aider', prompt: 'type', note: 'pass `--model ollama_chat/<model>` for a local model' },
  {
    id: 'colibri',
    name: 'Claude Code on Colibri',
    command: 'claude',
    claude: true,
    env: {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8000',
      ANTHROPIC_AUTH_TOKEN: 'local',
      ANTHROPIC_MODEL: 'glm-5.2-colibri',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-5.2-colibri'
    },
    note: 'a local model served by `coli serve` on the host, port 8000'
  },
  {
    id: 'ollama',
    name: 'Claude Code on Ollama',
    command: 'claude',
    claude: true,
    env: {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama',
      ANTHROPIC_MODEL: 'qwen3-coder',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3-coder'
    },
    note: 'a local model served by Ollama on the host (`ollama pull qwen3-coder`)'
  }
]

const ID = /^[a-z][a-z0-9_-]{0,31}$/
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const FLAG = /^--?[A-Za-z0-9][\w-]*$/

/** One entry of agents.json, or an explanation of why it was skipped. */
export function validBackend(x: unknown): AgentBackend | string {
  if (!x || typeof x !== 'object') return 'not an object'
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || !ID.test(o.id)) return `id ${JSON.stringify(o.id)} must be a lowercase word`
  if (typeof o.command !== 'string' || !o.command.trim() || /[\n\r\0]/.test(o.command)) return `${o.id}: command must be one line`
  const b: AgentBackend = { id: o.id, name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : o.id, command: o.command.trim() }
  if (o.env !== undefined) {
    if (!o.env || typeof o.env !== 'object' || Array.isArray(o.env)) return `${o.id}: env must be an object`
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(o.env)) {
      if (!ENV_NAME.test(k)) return `${o.id}: ${JSON.stringify(k)} is not a variable name`
      if (typeof v !== 'string' || /[\n\r\0]/.test(v)) return `${o.id}: ${k} must be a one-line string`
      env[k] = v
    }
    b.env = env
  }
  if (o.prompt !== undefined) {
    if (o.prompt !== 'arg' && o.prompt !== 'type' && !(typeof o.prompt === 'string' && FLAG.test(o.prompt))) {
      return `${o.id}: prompt must be "arg", "type" or a flag like "--prompt"`
    }
    b.prompt = o.prompt
  }
  if (o.claude !== undefined) b.claude = o.claude === true
  else b.claude = isClaudeCommand(b.command)
  if (typeof o.note === 'string') b.note = o.note
  return b
}

/** Built-in backends with agents.json's on top: same id replaces, new ids follow. */
export function mergeBackends(file: unknown): { backends: AgentBackend[]; errors: string[] } {
  const errors: string[] = []
  const list = Array.isArray(file) ? file : file && typeof file === 'object' ? (file as { agents?: unknown }).agents : undefined
  const out = BUILTIN_BACKENDS.map((b) => ({ ...b }))
  if (file !== undefined && !Array.isArray(list)) errors.push('expected { "agents": [ … ] }')
  for (const x of Array.isArray(list) ? list : []) {
    const b = validBackend(x)
    if (typeof b === 'string') {
      errors.push(b)
      continue
    }
    const i = out.findIndex((o) => o.id === b.id)
    if (i >= 0) out[i] = b
    else out.push(b)
  }
  return { backends: out, errors }
}

/** The command is Claude Code itself (`claude`, `/opt/bin/claude --model opus`). */
export function isClaudeCommand(cmd: string): boolean {
  return /^(\S*\/)?claude(\s|$)/.test(cmd.trim())
}

/**
 * `@codex fix the tests` → backend `codex`, prompt `fix the tests`. A leading
 * `@word` that names no backend stays in the prompt (it may be a file mention).
 */
export function splitBackendPrefix(prompt: string, backends: AgentBackend[]): { backend?: string; prompt: string } {
  const m = /^@([a-z][a-z0-9_-]*)(?:\s+|$)/.exec(prompt.trimStart())
  if (!m || !backends.some((b) => b.id === m[1])) return { prompt }
  return { backend: m[1], prompt: prompt.trimStart().slice(m[0].length) }
}

/** Single-quote for POSIX sh, bash, zsh and tcsh. */
function quote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** `env 'A=1' 'B=2' ` in front of the command: works in every login shell, csh included. */
export function envPrefix(env?: Record<string, string>): string {
  const pairs = Object.entries(env ?? {}).filter(([k]) => ENV_NAME.test(k))
  return pairs.length ? `env ${pairs.map(([k, v]) => quote(`${k}=${v}`)).join(' ')} ` : ''
}

/**
 * The command line for a backend. `base` is the command (the project's agent
 * command for Claude Code); `extra` are Kuna's own flags (hooks, session id);
 * `promptRef` is the shell expression that reads the prompt file.
 */
export function backendCommand(b: AgentBackend, base: string, extra: string, promptRef?: string): string {
  let cmd = envPrefix(b.env) + base + extra
  const how = b.prompt ?? 'arg'
  if (promptRef && how !== 'type') cmd += how === 'arg' ? ` ${promptRef}` : ` ${how} ${promptRef}`
  return cmd
}
