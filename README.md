# Kuna

A keyboard-first control room for long-running coding agents — on your Mac or on any machine in your `~/.ssh/config`.

![Four Claude Code agents in a 2×2 grid with the sidebar and inspector](docs/images/doc-main.png)

Kuna replaces the "VS Code for plots + four iTerm windows of agents" setup with one window:

- **Your Claude background sessions, too.** Everything you run with `claude --bg` or from `claude agents` on a host shows up under the folder it works in — with its state, what it is doing right now, and the question it is waiting on. Enter opens it (`claude attach`), a number key answers it. New agents launched from Kuna are background sessions as well, so they appear in `claude agents` and on your phone.
- **Projects → folders → agents** in a sidebar. Projects live on a host (this Mac or an SSH alias), folders are repositories on that host, and every agent you start shows up under its folder.
- **Agents never die with the app.** Each agent runs in a tmux session on its host. Quit Kuna, close the laptop, reopen tomorrow: the agents are still listed, with their status and whether they have something you haven't seen. The panes you had open come back (those whose agents still run); any other agent opens with Enter.
- **Launch by typing.** Arrow to a folder, type the task, press Enter. The new agent opens on the right, and panes re-balance automatically (1 → full, 2 → vertical split, 3 → a third below the first two, 4 → 2×2, …).
- **Arrows everywhere.** Arrows move between the sidebar and the tabs. Start typing on a tab to talk to that agent, Enter sends and drops you back to navigation, Esc Esc abandons what you typed.
- **Plots and PDFs on Space.** Space shows the plots and PDFs from the agent's latest reply (PDFs first, then images, in the order the reply names them), fitted to the window and sharp; pinch or ⌘+/⌘− to zoom, drag to pan. → keeps going into earlier replies, and only then scans the folder. Just type to comment on the plot in view; Enter sends it to the agent as "About plots/x.png: …". No more switching to VS Code to look at a histogram.
- **Live and direct.** Output streams straight from tmux over SSH — no cloud relay. Status, context use, tasks, subagents and tools come from Claude Code's own transcript and hooks on the host.
- **Browse `.claude`.** ⌘K lists skills, agents, commands, `CLAUDE.md` and settings on this Mac or any host, rendered.
- **Repo colours.** Every folder has a colour; each pane carries it as a rail on its left edge.
- **Your fonts.** The interface uses VS Code's look (system font, your editor font and sizes from VS Code's settings); agent panes use the font your iTerm2 profile shows Claude Code in.
- **Arrange with the mouse too.** Drag projects, folders and agents around the sidebar, drag a pane header onto another pane to swap them, and drag the side panels' edges to resize them.
- **Math in names.** Project and folder names render `$…$` as LaTeX (KaTeX): `$t\bar{t}H(\gamma\gamma)$` shows as proper math in the sidebar.
- **Plan usage in the bottom bar.** The 5-hour session and weekly limits of your Claude Pro/Max plan, with reset times, as Claude Code reports them to its status line.

## Requirements

| Where | What |
| --- | --- |
| Your Mac | macOS 13+, Node.js 22+, Xcode command line tools (for the terminal library), `tmux` if you want agents on this Mac (`brew install tmux`) |
| Each SSH host | `tmux` (any version from the last decade), `claude` (or another agent CLI), a POSIX `sh`. Nothing else is installed system-wide. |

Kuna uses your own `ssh`: keys, `ProxyJump`, Kerberos and connection sharing from `~/.ssh/config` all work as they do in a terminal.

## Run it

```sh
npm install        # also rebuilds the terminal library for Electron
npm run dev        # development build with hot reload
npm run dist       # builds release/mac-arm64/Kuna.app
sh scripts/smoke.sh   # checks the install: opens Kuna once with a throwaway profile
```

Setting it up with a coding agent? Point it at [CLAUDE.md](CLAUDE.md): it has the steps, checks and ground rules.

## First five minutes

1. **⌘N** — create a project. Pick *This Mac* or a host from your SSH config (type to filter, ↑ ↓ to choose). The agent command defaults to `claude`; add flags like `--model opus` if you like. Names can contain LaTeX math between dollar signs, like `$HH\to b\bar{b}\tau\tau$ analysis`; the dialog shows how it will look (`\$` for a literal dollar).
2. **⌘O** — add a folder. The path box completes directories on that host (Tab completes, ↑ ↓ picks).
3. With the folder selected, **just start typing** the task and press **Enter**. The agent starts in a tmux session on the host and opens in a pane.
4. Launch a few more. Use **← →** to move between the sidebar and the panes, and **↑ ↓ ← →** between panes.
5. On a pane, **type** to talk to the agent; **Enter** sends. **Space** previews its plots. **⌘W** closes the pane, the agent keeps working. **Ctrl+X Ctrl+X** kills it (a background session is stopped and taken off the list; **⌘Z** brings it back).
6. Quit Kuna. Reopen it. Your agents are in the sidebar; the diamond marks agents with output you haven't looked at.

All shortcuts: **⌘/** in the app, or [docs/KEYBOARD.md](docs/KEYBOARD.md).

## What the sidebar tells you

| Mark | Meaning |
| --- | --- |
| pulsing dot | working (Claude's spinner is on screen, or a hook just fired) |
| amber dot | needs you: a permission prompt, folder-trust question or menu |
| grey dot | idle, waiting for the next instruction |
| hollow dot | exited / stopped — Enter brings a stopped background session back; **⇧⌘R** resumes a Kuna agent's conversation |
| amber line under a row | the question or permission it is waiting on; open it and press the number of your answer |
| diamond | finished or asked something since you last looked |
| small square | currently open in a pane |
| amber gauge with a percentage | a running agent's context is getting long: past half the window, or past 300k tokens |
| red gauge | its context is almost full (80%); Claude Code will compact it by itself soon |

![Context gauges in the sidebar and the Compact button in the inspector](docs/images/context-warning.png)

The inspector on the right (**⌘B**; **⌘S** hides the sidebar on the left) shows the focused agent's context window use, model, permission mode, token counts, task list, running subagents, recent tool calls, files it changed, and the exact `tmux` command to attach from any terminal. Its **Compact** button runs `/compact` in the agent: Claude summarizes the conversation so far and continues from the summary. The button waits while the agent is mid-turn or waiting on you. Anything half-typed in the agent's input box is cleared first; Ctrl+Y in the agent brings it back. For a background session it opens the session's tab first, because those only take input through `claude attach`.

## Colour schemes

Six dark schemes (the newest, **Black**, is black with plain greys); terminals are pure black in all of them, and status colours are the same in every one. Switch with **⌘,** (↑ ↓ previews live).

| Cherenkov (default) | Calorimeter | Tracker |
| --- | --- | --- |
| ![](docs/images/theme-cherenkov.png) | ![](docs/images/theme-calorimeter.png) | ![](docs/images/theme-tracker.png) |
| **Muon** | **Phosphor** | |
| ![](docs/images/theme-muon.png) | ![](docs/images/theme-phosphor.png) | |

See [docs/THEMES.md](docs/THEMES.md) for the palettes and how to add your own.

## Documentation

- [docs/KEYBOARD.md](docs/KEYBOARD.md) — every shortcut and the navigate/typing model
- [docs/REMOTE-HOSTS.md](docs/REMOTE-HOSTS.md) — SSH setup, sign-in, clusters, `lxplus`-style aliases, troubleshooting
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how agents, hosts, tmux, hooks and transcripts fit together
- [docs/THEMES.md](docs/THEMES.md) — colour schemes
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — building, testing, scripted screenshots, project layout
- [SECURITY.md](SECURITY.md) — what Kuna can do on your machines, what it trusts and stores, and how to report a problem

## Status

Early but working: tested end to end with Claude Code 2.1 on macOS (local agents) and through the SSH code path with an integration test. Expect rough edges on exotic login shells and very old tmux.
