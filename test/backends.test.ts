import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { BUILTIN_BACKENDS, backendCommand, envPrefix, isClaudeCommand, mergeBackends, splitBackendPrefix, validBackend } from '@shared/backends'
import { parseJsonc } from '@shared/jsonc'

const PROMPT = '"$(cat "$KUNA_DIR/prompt")"'

describe('agent backends', () => {
  it('recognises Claude Code commands', () => {
    expect(isClaudeCommand('claude')).toBe(true)
    expect(isClaudeCommand('claude --model opus')).toBe(true)
    expect(isClaudeCommand('/opt/bin/claude')).toBe(true)
    expect(isClaudeCommand('codex')).toBe(false)
    expect(isClaudeCommand('env FOO=1 claude')).toBe(false)
    expect(isClaudeCommand('claude-dev')).toBe(false)
  })

  it('takes @id off the start of a prompt only when it names a backend', () => {
    expect(splitBackendPrefix('@codex fix the tests', BUILTIN_BACKENDS)).toEqual({ backend: 'codex', prompt: 'fix the tests' })
    expect(splitBackendPrefix('  @ollama\nexplain this', BUILTIN_BACKENDS)).toEqual({ backend: 'ollama', prompt: 'explain this' })
    expect(splitBackendPrefix('@gemini', BUILTIN_BACKENDS)).toEqual({ backend: 'gemini', prompt: '' })
    // a file mention stays a file mention
    expect(splitBackendPrefix('@src/main.ts explain', BUILTIN_BACKENDS)).toEqual({ prompt: '@src/main.ts explain' })
    expect(splitBackendPrefix('@nobody hi', BUILTIN_BACKENDS)).toEqual({ prompt: '@nobody hi' })
    expect(splitBackendPrefix('fix @codex', BUILTIN_BACKENDS)).toEqual({ prompt: 'fix @codex' })
  })

  it('builds command lines: env first, prompt as argument, after a flag, or not at all', () => {
    const codex = BUILTIN_BACKENDS.find((b) => b.id === 'codex')!
    const gemini = BUILTIN_BACKENDS.find((b) => b.id === 'gemini')!
    const aider = BUILTIN_BACKENDS.find((b) => b.id === 'aider')!
    const colibri = BUILTIN_BACKENDS.find((b) => b.id === 'colibri')!
    expect(backendCommand(codex, codex.command, '', PROMPT)).toBe(`codex ${PROMPT}`)
    expect(backendCommand(codex, codex.command, '', undefined)).toBe('codex')
    expect(backendCommand(gemini, gemini.command, '', PROMPT)).toBe(`gemini -i ${PROMPT}`)
    expect(backendCommand(aider, aider.command, '', PROMPT)).toBe('aider')
    expect(backendCommand(colibri, 'claude', ' --session-id x', PROMPT)).toBe(
      `env 'ANTHROPIC_BASE_URL=http://127.0.0.1:8000' 'ANTHROPIC_AUTH_TOKEN=local' 'ANTHROPIC_MODEL=glm-5.2-colibri' 'ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-5.2-colibri' claude --session-id x ${PROMPT}`
    )
  })

  it('quotes env values so a login shell passes them through unchanged', () => {
    const line = envPrefix({ A: "it's $HOME `x` \"q\"", B: 'two words' }) + 'printenv A B'
    const out = execFileSync('sh', ['-c', line], { encoding: 'utf8' })
    expect(out).toBe("it's $HOME `x` \"q\"\ntwo words\n")
    expect(envPrefix({})).toBe('')
    expect(envPrefix({ 'BAD NAME': 'x' })).toBe('')
  })

  it('validates agents.json entries', () => {
    expect(validBackend({ id: 'qwen', command: 'qwen', prompt: '-i' })).toEqual({ id: 'qwen', name: 'qwen', command: 'qwen', prompt: '-i', claude: false })
    expect(validBackend({ id: 'local', command: 'claude --model x' })).toMatchObject({ claude: true })
    expect(validBackend({ id: 'Bad', command: 'x' })).toMatch(/lowercase/)
    expect(validBackend({ id: 'x', command: 'a\nrm -rf ~' })).toMatch(/one line/)
    expect(validBackend({ id: 'x', command: 'a', env: { 'A B': '1' } })).toMatch(/variable name/)
    expect(validBackend({ id: 'x', command: 'a', env: { A: 1 } })).toMatch(/string/)
    expect(validBackend({ id: 'x', command: 'a', prompt: '; rm' })).toMatch(/prompt/)
  })

  it('merges agents.json over the built-in backends', () => {
    const file = parseJsonc(`{
      // a GPU box on the network
      "agents": [
        { "id": "colibri", "command": "claude", "env": { "ANTHROPIC_BASE_URL": "http://gpu01:8000" } },
        { "id": "qwen", "name": "Qwen Code", "command": "qwen", "prompt": "-i" },
        { "id": "BROKEN" },
      ]
    }`)
    const { backends, errors } = mergeBackends(file)
    expect(backends.map((b) => b.id)).toEqual([...BUILTIN_BACKENDS.map((b) => b.id), 'qwen'])
    expect(backends.find((b) => b.id === 'colibri')?.env).toEqual({ ANTHROPIC_BASE_URL: 'http://gpu01:8000' })
    expect(errors).toHaveLength(1)
    expect(mergeBackends(undefined)).toEqual({ backends: BUILTIN_BACKENDS, errors: [] })
    expect(mergeBackends({ agents: 3 }).errors).toHaveLength(1)
  })
})
