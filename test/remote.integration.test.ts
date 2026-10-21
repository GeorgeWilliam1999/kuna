import { describe, expect, it } from 'vitest'
import type { AgentRuntime } from '@shared/types'

/**
 * Opt-in test against a real SSH host from your config:
 *   KUNA_REMOTE_HOST=myhost npx vitest run test/remote.integration.test.ts
 * Installs/updates ~/.kuna on the host, starts a dummy agent in a scratch
 * directory under ~/.kuna, exercises the hook, watch, read and claude-files
 * paths, then kills the agent and removes the scratch directory.
 */
const HOST = process.env.KUNA_REMOTE_HOST

describe.skipIf(!HOST)(`remote host ${HOST}`, () => {
  it('installs, streams, spawns, reads and kills over real ssh', async () => {
    const { Host } = await import('../src/main/hosts/host')
    const { b64 } = await import('../src/main/hosts/exec')
    const host = new Host(HOST!)
    const frames: AgentRuntime[][] = []
    host.on('agents', (a: AgentRuntime[]) => frames.push(a))

    const t0 = Date.now()
    await host.connect()
    console.log(`connect+install: ${Date.now() - t0} ms`, JSON.stringify(host.state))
    expect(host.state.status).toBe('ready')
    expect(host.state.tmux).toBeTruthy()

    const id = `t${Date.now().toString(36)}`
    const dir = '~/.kuna/test-scratch'
    await host.exec(['ls', b64('~')]) // warm the connection
    const mk = await host.exec(['spawn', id, b64('~'), b64(`mkdir -p ${dir}; sleep 300`), '100', '30', b64(JSON.stringify({ cwd: '~' })), b64('')])
    expect(mk.code).toBe(0)

    // simulate Claude Code calling the hook from inside the agent
    const transcript = `$HOME/.kuna/test-scratch/${id}.jsonl`
    const hookCmd =
      `mkdir -p $HOME/.kuna/test-scratch && printf '%s\\n' '{"type":"ai-title","aiTitle":"Remote test"}' > ${transcript} && ` +
      `printf '{"hook_event_name":"Stop","transcript_path":"%s"}' ${transcript} | KUNA_AGENT_ID=${id} sh .kuna/bin/kuna hook`
    const { run } = await import('../src/main/hosts/exec')
    const hook = await run('ssh', ['-o', 'BatchMode=yes', ...host.sshArgs(), HOST!, hookCmd])
    expect(hook.code).toBe(0)
    expect(hook.stdout.toString()).toBe('') // hooks must stay silent

    const t1 = Date.now()
    let agent: AgentRuntime | undefined
    while (Date.now() - t1 < 20_000) {
      agent = frames.at(-1)?.find((a) => a.id === id && a.transcriptSize > 0)
      if (agent) break
      await new Promise((r) => setTimeout(r, 200))
    }
    console.log(`hook → frame: ${Date.now() - t1} ms`, JSON.stringify(agent))
    expect(agent).toMatchObject({ alive: true, lastEvent: 'Stop', status: 'idle' })

    const read = await host.exec(['read', b64(agent!.transcriptPath!), '0', '1000'])
    expect(read.stdout.toString()).toContain('Remote test')

    const files = await host.exec(['claude-files', b64('~')])
    console.log('claude-files:', files.stdout.toString().split('\n').filter(Boolean).length, 'entries')

    await host.exec(['kill', id])
    const t2 = Date.now()
    while (Date.now() - t2 < 15_000 && frames.at(-1)?.some((a) => a.id === id)) await new Promise((r) => setTimeout(r, 200))
    expect(frames.at(-1)?.some((a) => a.id === id)).toBe(false)
    await run('ssh', ['-o', 'BatchMode=yes', ...host.sshArgs(), HOST!, 'rm -rf .kuna/test-scratch'])
    host.dispose()
  }, 120_000)
})
