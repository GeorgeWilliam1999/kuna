# Agents other than Claude Code

Kuna starts Claude Code by default, but any agent CLI that runs in a terminal can run in its panes. Kuna calls these **agent backends**. Each one is a command line, optionally with environment variables, run through your login shell on the project's host inside Kuna's tmux server.

## Choosing one

- **Per project:** ⌘R on a project (Edit project) → **Agent**. New agents in its folders use that backend.
- **Per launch:** start the prompt with `@<id>`, e.g. `@codex fix the failing test` or `@ollama explain this repository`. The launch box shows which agent Enter starts. A leading `@word` that names no backend stays in the prompt, so Claude Code's `@file` mentions still work.

The inspector names the backend of an agent that isn't the project's Claude Code.

## Built in

| id | Runs | Notes |
| --- | --- | --- |
| `claude` | the project's agent command (`claude` unless changed) | everything Kuna knows: hooks, transcripts, background sessions, ⇧⌘R resume |
| `codex` | `codex "<prompt>"` | OpenAI Codex CLI; `codex --oss` runs it on a local model through Ollama |
| `gemini` | `gemini -i "<prompt>"` | Gemini CLI |
| `opencode` | `opencode --prompt "<prompt>"` | OpenCode; configure local providers in its own config |
| `aider` | `aider`, then the prompt is typed in | add `--model ollama_chat/<model>` in agents.json for a local model |
| `colibri` | Claude Code with `ANTHROPIC_BASE_URL=http://127.0.0.1:8000` | a local model served by [Colibri](https://github.com/JustVugg/colibri)'s `coli serve`, which speaks the Anthropic Messages API |
| `ollama` | Claude Code with `ANTHROPIC_BASE_URL=http://127.0.0.1:11434` | a local model served by [Ollama](https://docs.ollama.com/api/anthropic-compatibility) (`qwen3-coder` by default) |

The CLI has to be installed on the host; Kuna doesn't install it. `127.0.0.1` is the host the project runs on, so a local model server has to run there (or be reachable from there under another address).

`colibri` and `ollama` are Claude Code, so they get Kuna's hooks, transcripts, context gauges and ⇧⌘R resume. They always run in Kuna's tmux server, never as `claude --bg` background sessions: Claude Code's daemon starts those with its own environment and would ignore the local server.

## Adding your own: agents.json

**Add agents in agents.json** in Edit project opens `~/Library/Application Support/Kuna/agents.json` (created with commented examples the first time). It is JSON with comments. Kuna reads it every time it launches an agent, so changes need no restart; entries it can't use are listed in Edit project.

```jsonc
{
  "agents": [
    // Claude Code on a model server elsewhere on the network
    {
      "id": "gpu",
      "name": "Claude Code on the GPU box",
      "command": "claude --model glm-5.2-colibri",
      "env": { "ANTHROPIC_BASE_URL": "http://gpu01:8000", "ANTHROPIC_AUTH_TOKEN": "local" }
    },
    // another agent CLI; its prompt goes after -i
    { "id": "qwen", "name": "Qwen Code", "command": "qwen", "prompt": "-i" },
    // change a built-in one: same id
    { "id": "ollama", "command": "claude", "env": { "ANTHROPIC_BASE_URL": "http://127.0.0.1:11434", "ANTHROPIC_AUTH_TOKEN": "ollama", "ANTHROPIC_MODEL": "gpt-oss:20b" } }
  ]
}
```

| Field | |
| --- | --- |
| `id` | lowercase word; what you type after `@` |
| `name` | shown in Edit project and the inspector |
| `command` | the command line, as you would type it in a terminal on the host |
| `env` | variables for the agent, passed as `env 'NAME=value' <command>` so every login shell (csh too) takes them |
| `prompt` | how the first prompt gets there: `"arg"` (default, the last argument), a flag such as `"-i"` or `"--prompt"`, or `"type"` (typed into the agent three seconds after it starts) |
| `claude` | it is Claude Code (guessed from a command starting with `claude`): Kuna adds its hook settings, a session id and `--resume` |
| `note` | one line shown under the choice |

The command and the variables are stored in `~/.kuna/agents/<id>/cmd` on the host (private to you). Keep real API keys in your shell's environment on the host rather than in agents.json.

## What Kuna knows about other agents

Claude Code tells Kuna what it is doing through hooks and its transcript. Other CLIs don't, so their status comes from the screen: **working** while a spinner with "esc to interrupt" (Codex, older Claude Code), "esc to cancel" (Gemini CLI) or "esc interrupt" (OpenCode) is visible or the screen keeps changing, **idle** once it settles, **exited** when the program ends. They have no context gauges, task lists or plot pages from the transcript, and ⇧⌘R can't resume them. Panes, typing, Ctrl+X and the unread marker when one exits work as usual.

## Plugins inside an agent

Rulesets and plugins that live inside an agent, such as [Ponytail](https://github.com/DietrichGebert/ponytail), need nothing from Kuna: install them in the agent (`/plugin marketplace add DietrichGebert/ponytail`, then `/plugin install ponytail@ponytail` in Claude Code) and every agent Kuna starts on that host picks them up.
