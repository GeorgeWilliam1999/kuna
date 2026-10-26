# One renderer per window; the main process owns shared state

Kuna can open several windows. Each one is its own BrowserWindow and renderer, with its own panes, terminals, focus and mode. Everything the windows share (projects and folders, settings, agent names, unread markers, hidden sessions) is owned by the main process, which is the only writer of `kuna-state.json` and pushes every change to all windows. Before this, the single renderer saved the whole state file itself; with two renderers doing that, each would overwrite the other's edits.

## Considered Options

- **One renderer driving several windows** through `window.open` child windows that share its JavaScript. One store and nothing to sync, but xterm's WebGL renderer, focus and the capture-phase key listener would have to work across documents, and one renderer crash or reload would take every window with it.

## Consequences

- Pty output is routed to the window that opened the pane, not broadcast.
- Window-level actions (jumping to the next window, carrying a pane over, notifications) go through the main process, which knows every window's position and panes.
