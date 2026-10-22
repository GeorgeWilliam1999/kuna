# Architecture

Kuna is an Electron app. The interesting part is not the window but the contract with each host: agents must outlive the app, and the app must learn everything it shows cheaply and quickly.

```
 Mac                                                     Host (this Mac or ssh alias)
┌───────────────────────────────────────────┐          ┌──────────────────────────────────────┐
│ Renderer (React)                          │          │ ~/.kuna/bin/kuna   (POSIX sh helper)  │
│  sidebar · panes (xterm.js) · inspector   │          │                                      │
│        ▲ IPC                              │          │ tmux -L kuna                          │
│ Main process                              │  ssh     │   kuna_<id>  ── $SHELL -lic claude …  │
│  Host ── `kuna watch` stream ────────────────────────▶   (one session per agent)            │
│       ── `kuna spawn/kill/read/stat/…` ──────────────▶                                      │
│  PtyService ── `ssh -tt host kuna attach` ───────────▶ tmux attach (only for open panes)     │
│  AgentService (merge, transcripts)        │          │ ~/.kuna/agents/<id>/  status, attn,   │
│  Media / .claude services                 │          │   transcript path  ◀── Claude hooks   │
└───────────────────────────────────────────┘          │ ~/.claude/projects/…/<session>.jsonl  │
                                                       └──────────────────────────────────────┘
```

## Why tmux

An agent has to keep running when the Mac sleeps, the network drops or Kuna quits. tmux is on every cluster, has been stable for fifteen years, and lets you attach from a normal terminal too. Kuna runs its own tmux server (`-L kuna`, its own config) so it never touches the tmux you use by hand: no status bar, no prefix key, large scrollback, mouse wheel scrolling, `remain-on-exit` so a crashed agent's last words stay visible.

Opening a pane runs `ssh -tt <host> sh .kuna/bin/kuna attach <id>` inside a local pseudo-terminal (node-pty) and renders it with xterm.js (WebGL). Closing the pane kills only that ssh client. Only open panes have a live attach; everything else in the sidebar is driven by the watch stream.

## The helper script

`src/main/remote/kuna.sh` is the only thing installed on a host. Its version is the hash of its content; Kuna reinstalls it whenever the hash differs. All arguments that can contain arbitrary text are base64, so commands survive bash, zsh and tcsh login shells unchanged. Subcommands:

| Command | Purpose |
| --- | --- |
| `setup`, `doctor` | locate tmux/claude via the login shell, write tmux config and hook settings, report versions |
| `spawn <id> …` | create `~/.kuna/agents/<id>/`, start `tmux new-session` running `kuna run <id>` |
| `run <id>` | inside tmux: `$SHELL -lic "<agent command>"`, then record the exit code |
| `watch` | stream state frames (see below) |
| `hook` | Claude Code hook entry point; records event, tool, permission mode, transcript path |
| `statusline` | Claude Code status line entry point; records plan usage (`rate_limits`) |
| `attach`, `kill`, `key`, `send` | tmux plumbing |
| `read`, `stat`, `cat`, `media`, `ls`, `claude-files` | file access for transcripts, plots, completion and the `.claude` browser |

## State: two sources, merged

**Watch frames** (cheap, every second when something changes). For each tmux pane: dead or alive, last activity, whether Claude's spinner (`✳ Thinking… (12s · ↓ 1.2k tokens)`) or a question (`Enter to confirm`, `Do you want to…`) is on screen, tmux copy mode, pane title. For each agent directory: the last hook event, the last "attention" time and the transcript size. `src/shared/watch.ts` turns a frame into `AgentRuntime` records and derives the status:

1. pane gone or dead → **exited**
2. a question on screen → **needs you**
3. spinner on screen → **working**
4. otherwise the last hook event: `PermissionRequest`/permission `Notification` → needs you, `Stop` → idle, tool or prompt events within a few seconds → working
5. no hooks at all (other agent CLIs) → screen activity

Remote timestamps are converted with the host's clock offset, measured from each frame, so status and "unread" work across clock skew.

**Transcripts** (rich, incremental). Claude Code writes every message to `~/.claude/projects/<cwd>/<session>.jsonl`. The `SessionStart` hook tells Kuna the path. When a frame reports the file grew, Kuna reads only the new bytes (`kuna read <path> <offset>`), decodes them with a UTF-8 decoder that holds back split characters, and feeds `TranscriptParser` (`src/shared/transcript.ts`). On a first look at a huge transcript it starts from the last 3 MB. The parser keeps a summary only: title, model, permission mode, context tokens (input + cache of the latest main-chain message), output tokens (deduplicated by message id), `TodoWrite` and `TaskCreate`/`TaskUpdate` tasks, running `Task`/`Agent` subagents, recent tool calls, edited files and every image/PDF path mentioned.

## Claude background sessions

Claude Code's daemon keeps one directory per background session in `~/.claude/jobs/<id>/`. Its `state.json` carries `state` (working/blocked/done), `tempo` (active/blocked/idle), `detail` (what it is doing, in words), `needs` and `block.questions` (what it waits for), `output.result` (its last reply), `linkScanPath` (the transcript), the worktree and token count. `kuna watch` re-reads these only when an `ls -l | cksum` signature over the state files and the roster changes, when a transcript grew (checked every 10 s), or every 30 s, with one `awk` pass over all files, and checks liveness against the daemon roster (`kill -0` on worker pids; nothing secret leaves the host). They become `J`/`Q`/`F`/`S`/`C`/`T` lines in the frame and `AgentRuntime` records of kind `claude`:

| state.json | Kuna status |
| --- | --- |
| `tempo: blocked` (or `state: blocked`) | needs you |
| `tempo: active` | working, with the tool call it is in the middle of (`T` line, from the transcript tail: "running python fit.py", "editing fit.py"); a turn silent for 30 min with no worker process died: stopped |
| `state: failed` | failed |
| `state: stopped` | stopped |
| `inFlight` with queued prompts, tasks or a `session_cron` (`F` line) | waiting on a job: "next check 11:25" (`inFlight.wake`), "watching a job", "2 jobs running" |
| otherwise | idle (done) |

The daemon roster is not used for status: sessions between scheduled check-ins, or attached in a terminal, run without a roster entry. A session counts as running (`alive`) when it is in the roster or working, waiting on you or on a job of its own.

Attaching runs `claude attach <id>`; stop/remove/respawn call the claude CLI. Kuna launches new background sessions with `claude --bg --settings ~/.kuna/claude-hooks.json "<prompt>"` and reads the id from its output.

Questions are visible for both kinds: background sessions report them in `state.json`; for Kuna's own agents the transcript parser keeps every `AskUserQuestion` call without a result as pending.

## Context fullness

The sidebar warns about long contexts for every running agent, open or not, so the numbers can't depend on transcripts Kuna only follows for open tabs. For background sessions the host works them out itself: when a transcript has grown, `kuna watch` reads its last 256 KB (`tail -c`), at most every 10 s per transcript, and takes the input + cache tokens of the last main-thread reply (sidechain replies and subagent `progress` records don't count). After a `compact_boundary` record it uses `postTokens` until the next reply arrives. It caches `size tokens peak model time` per transcript in `~/.kuna/ctx/` and reports `C tokens peak model path`. Kuna's own agents get the same numbers from `TranscriptParser`, which handles compactions the same way.

`src/shared/context.ts` turns tokens into a level. The window follows Claude Code's model table: 200k for Claude 3, Opus/Sonnet 4–4.5 and Haiku 4.5, 1M natively for newer models; Bedrock and Vertex spellings of a model id count as the same model. Transcripts name the API model, so a `[1m]` session is recognised by the `--model` it was started with: the agent command for Kuna agents, `respawnFlags` in `state.json` (the last field of its `J` line) for background sessions. A session that has ever held more than 200k (the peak, which survives compactions) also gets 1M. The level is `long` from 50% of the window or 300k tokens, and `full` from 80%.

**Compact** in the inspector types `/compact` into an idle agent. It first empties the input box (End, then Ctrl+U and Backspace for up to six lines; Ctrl+Y in Claude Code brings a draft back) and sends the Enter on its own, so Claude Code doesn't treat it as part of a paste. Kuna agents without an open tab get the keys through `tmux send-keys` (`kuna send`). Background sessions only take input through `claude attach`, so Kuna opens (or reattaches) the tab and types only once the screen has settled and shows the input box. If a question or a running turn shows up instead, or the agent's status changed while it attached, nothing is typed. The button stays disabled while a Compact is on its way.

## Plan usage

Claude Code (2.1.80+) passes `rate_limits.five_hour` / `seven_day` (`used_percentage`, `resets_at`) to status line commands. Kuna's hook settings include `statusLine: kuna statusline`, which extracts that object and stores it in `~/.kuna/usage` only when it changes. The watch stream carries it as a `U` line; the main process keeps the freshest report across hosts (usage is per account) and the status bar shows both windows with reset times. It appears after a Kuna-launched agent's first reply and only for Pro/Max plans.

## Unread

The hook script stamps `attn` when an agent stops (`Stop`), asks (`PermissionRequest`, permission `Notification`) or exits. The renderer keeps `lastSeen[agent]` (persisted); an agent is unread while `attn > lastSeen`. Focusing a pane marks it seen. Seen markers for vanished agents are pruned only after the host has reported a complete list.

## Plots and PDFs

Space asks the main process for one page of media at a time, so the first plot shows after a single `kuna stat`. `TranscriptParser` remembers, for every image, PDF or Markdown path in the conversation, the reply (turn) that mentioned it last. The first page is the newest reply with files that still exist; browsing past its last file asks for the reply before (`before: turn`), and only when the conversation has nothing older does Kuna run the folder scan (`find -newer`, files written under the folder since the agent started), which is slow on shared disks. Results are de-duplicated (same name, size and mtime); all PDFs come first, then the images, then Markdown files; each group is newest reply first, in the order the reply names them (the folder scan: newest first). The first page stats the newest replies' files in one call (up to ~80 paths, usually the whole session), so the PDF-first order holds across replies.

A comment written in the viewer is typed into the agent like any message (`sendToAgent`: `kuna send` for a Kuna agent without a tab, the attached tab otherwise), prefixed with the file it is about. If the agent's tab is open the comment is pasted there right away, whatever Kuna's status for it says (the screen is what counts); without a tab, a background session is opened first (attaching brings a stopped one back). Unlike `/compact` it may go to a working agent, since Claude Code queues it until the turn ends. Only a question or permission prompt on screen stops it, because the Enter would answer that.

Files are fetched with `kuna cat` over the shared ssh connection and cached by path + mtime + size, so the next file is prefetched and a re-made plot is never stale. The viewer fits each file to the window (small PNGs up to 2×) and zooms around the pointer; PDFs are re-rendered by pdf.js at the zoom level and the screen's pixel ratio once a zoom settles, so they stay sharp.

## Folders and real paths

Agents report their working directory with symlinks resolved (`getcwd`), while a folder may have been added through a symlink (`/project/exp/users/…` for `/project/exp/Users/…`) or with a stray `//`. Kuna cleans the path and asks the host once per folder for its physical path (`kuna realpath`, `cd … && pwd -P`), stores it as `real`, and places agents by either path.

## Renderer

- `store.ts` — zustand store: persisted projects/settings/lastSeen and the layout (open panes in order, the focused one, sidebar hidden or not) plus live agents, details, hosts and UI focus. At start the saved panes reopen as their agents show up running; gone or stopped ones stay closed (attaching would restart a stopped background session).
- `keys.ts` + `actions.ts` — the navigate/typing state machine. A single capture-phase key listener decides whether a key is an app command or belongs to the terminal.
- `terminals.ts` — xterm instances kept outside React and re-parented into pane slots, so re-layouts never drop a terminal or its connection.
- `tree.ts` — places agents under folders: where the user put them by hand (a folder's `agents` list, from dragging or ⇧↑ ⇧↓; `@shared/arrange`), then by the folder they were launched from, then by working directory, then "Other agents". Background sessions stopped with Ctrl+X Ctrl+X are kept in `hidden` and left out until ⌘Z or until they run again.
- `components/` — sidebar, launch box, pane grid, inspector, overlays.

## Security notes

See [SECURITY.md](../SECURITY.md) for the whole picture: the bridge is effectively shell access on every host, so the main process validates hosts, agent ids, keys and paths, and the page renders untrusted text as text.

- The renderer is sandboxed with context isolation; it reaches the system only through the typed `window.kuna` bridge.
- Hook commands are silent and never print decisions, so they cannot approve anything on the agent's behalf.
- Markdown in the `.claude` browser is sanitised with DOMPurify; SVGs are shown through `<img>`, which does not run scripts.
- Kuna drops `CLAUDECODE`/`CLAUDE_CODE_*` variables from its own environment so agents started from Kuna never think they are a child of the session that launched Kuna.
