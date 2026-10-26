# Kuna

A keyboard-first control room for coding agents running in tmux on this Mac and on SSH hosts.

## Language

**Window**:
One Kuna window on the Mac. Every window shows the same sidebar; each has its own panes, focus and mode.
_Avoid_: workspace, instance

**Sidebar**:
The list of projects, folders and agents on the left, with the launch box under it. Its contents are the same in every window.
_Avoid_: tree

**Pane**:
An agent's live terminal open in a window's grid. An agent has at most one pane across all windows; closing it leaves the agent running.
_Avoid_: tab
