import type { AgentRuntime } from './types'

/**
 * Typing into Claude Code on the user's behalf (the Compact button).
 */

/**
 * Empties Claude Code's input box: End, then Ctrl+U and Backspace for each of
 * up to six lines. Ctrl+Y in Claude Code brings the draft back. `kuna send`
 * presses the same keys through tmux.
 */
export const CLEAR_INPUT = '\x05' + '\x15\x7f'.repeat(6)

/** Why the agent can't take a slash command right now, if it can't. */
export function compactBlocker(a: AgentRuntime): string | undefined {
  // a background session that is not running comes back when its tab opens
  if (!a.alive && a.kind !== 'claude') return 'The agent has exited.'
  if (a.status === 'working') return 'It is in the middle of a turn. Compact it once it is idle.'
  if (a.status === 'waiting') return 'It is waiting for you. Answer it first.'
  if (a.status === 'starting') return 'It is still starting.'
  return undefined
}

/**
 * Why a message can't be typed into the agent now. A working agent takes it:
 * Claude Code queues what is sent mid-turn and reads it when the turn ends.
 */
export function messageBlocker(a: AgentRuntime): string | undefined {
  if (!a.alive && a.kind !== 'claude') return 'The agent has exited.'
  if (a.status === 'waiting') return 'It is waiting for you. Answer it first.'
  if (a.status === 'starting') return 'It is still starting.'
  return undefined
}

/** A comment on a plot, as the agent reads it (one line: Enter would send early). */
export function plotComment(path: string, comment: string): string {
  return `About ${path}: ${comment.replace(/\s*\n\s*/g, ' ').trim()}`
}

export type ScreenState = 'input' | 'busy' | 'question' | 'unknown'

/** The prompt line between two rules: `❯ ` in Claude Code 2.1, `│ > ` before. */
export function hasInputBox(lines: string[]): boolean {
  const tail = lines.filter((l) => l.trim()).slice(-12)
  return tail.some((l) => /^\s*(?:│\s*)?[❯>]\s/.test(l)) && tail.some((l) => /─{20,}/.test(l))
}

/**
 * What the bottom of a Claude Code screen shows: a question or menu, the
 * spinner of a running turn, or the empty input box ready for typing (the
 * prompt line between two rules: `❯ ` in Claude Code 2.1, `│ > ` before).
 * The same phrases `kuna snapshot` looks for on the host.
 */
export function screenState(lines: string[]): ScreenState {
  const tail = lines.filter((l) => l.trim()).slice(-12)
  const text = tail.join('\n')
  if (/Enter to confirm|Esc to cancel|Do you want to/.test(text)) return 'question'
  if (/… *\([0-9]|to interrupt/.test(text)) return 'busy'
  return hasInputBox(lines) ? 'input' : 'unknown'
}
