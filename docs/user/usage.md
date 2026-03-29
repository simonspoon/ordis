# Usage

Ordis has two views: **Dashboard** for project and task management, and **Workspace** for multi-pane Claude Code terminal sessions.

## Dashboard

The Dashboard is the default view. It displays a grid of project cards loaded from `~/.ordis/config.toml`.

### Project Cards

Each card shows the project name, task count badges, and an expand toggle. Click a card to expand its task tree.

**Task count badges** (for limbo-enabled projects):
- **In progress** (purple) -- tasks currently being worked on
- **Todo** (gray) -- tasks not yet started
- **Done** (green) -- completed tasks

### Task Management

Expand a project card to see its task tree. Tasks display as a hierarchical list with parent-child nesting.

**Each task row shows:**
- Status dot (clickable -- cycles through todo, in-progress, done)
- Status label (also clickable for cycling)
- 4-character task ID
- Task name
- Delete button (x)
- Launch button (play icon)

**Click a task** to select it and reveal its detail panel:
- **Action**, **Verify**, **Result** fields (click any to edit inline)
- **Owner** (read-only, set via CLI)
- **Notes** list with an "Add note" input

**Adding tasks:** Click the **+** button on a project card header. Type a name and press Enter.

### Filtering and Search

The Dashboard header provides:

| Control | Purpose |
|---------|---------|
| Status filter buttons (All, Todo, In Progress, Done) | Show only tasks matching the selected status |
| Search input | Text search across task name, ID, action, and owner |
| Clear button (x) | Reset all filters |
| Refresh button | Reload projects and tasks from disk |

Filtering is hierarchical: when a child task matches, its entire ancestor chain is shown so you can see context.

## Workspace

The Workspace is a multi-pane terminal environment. Each pane runs an independent Claude Code session.

### Session Persistence

Ordis saves your pane layout and working directories to `~/.ordis/session.json` when the window closes. On next launch, the previous layout is automatically restored. If a saved session exists, Ordis opens directly to the Workspace view.

### Pane Management

**Creating panes:**
- Switch to Workspace (first visit auto-creates one pane)
- Split the active pane vertically or horizontally

**Closing panes:**
- Close via the tab bar x button
- Close via **Cmd+W** (cannot close the last pane this way)
- Panes also auto-close when their Claude Code session exits

**Switching panes:**
- Click on a pane to focus it
- Click a tab in the tab bar
- Use **Cmd+3** through **Cmd+9** to jump to panes by position

**Zooming a pane:**
- Press **Cmd+Shift+Enter** to temporarily maximize the focused pane to fill the entire workspace
- A **ZOOMED** indicator appears in the tab bar while zoomed
- Press **Cmd+Shift+Enter** again (or click the indicator) to restore the original split layout

### Pane Toolbar

Each pane has a toolbar showing:

| Element | Description |
|---------|-------------|
| Working directory | Abbreviated with `~`. Click to open a native folder picker. |
| Git badge | Shows branch name, `*` for dirty, `↑N`/`↓N` for ahead/behind. Polls every 5 seconds. Only appears when the pane CWD is inside a git repo. |
| Agent selector | Dropdown showing the current agent type (defaults to "default"). Lists agents from `~/.claude/agents/` and installed plugins. |

Changing the directory sends a `cd` command to the running Claude Code session.

### Terminal Search

Press **Cmd+F** while a pane is focused to open the search bar. Search is scoped to the focused pane's scrollback buffer.

| Control | Action |
|---------|--------|
| Search input | Type to search. Matches highlight in the terminal. |
| ↑ / ↓ buttons | Navigate between matches (previous / next) |
| Close button (x) | Dismiss the search bar |
| Escape | Also dismisses the search bar |

### Drag-and-Drop Tabs

Drag a tab header in the PaneBar to reorder panes. A visual indicator shows the drop target position. Dropping swaps the two panes in the layout tree.

### Split Dividers

Drag the divider between split panes to resize them. Ratios are clamped between 15% and 85% to prevent invisible panes.

### Task Sidebar

Press **Cmd+B** to toggle the task sidebar in the Workspace view. It shows a compact task list for all projects, with:
- Clickable status dots for quick status cycling
- Task IDs and names
- Launch buttons to open tasks as new panes

The sidebar is independent of the Dashboard -- it provides lightweight task awareness while working in terminals.

### Status Bar

A fixed bar at the bottom of the Workspace view showing:

| Element | Description |
|---------|-------------|
| Session count | Number of active terminal panes (e.g., "3 sessions") |
| Project name | Name of the current project directory |
| Git branch | Branch name and dirty indicator (`*`) for the focused pane's CWD |

The status bar updates automatically when you switch focus between panes.

## Named Workspaces

Save your current pane layout as a named workspace for quick restoration later.

- **Save**: Open the command palette (**Cmd+K**) and select "Save Workspace As..." — enter a name when prompted
- **Load**: Saved workspaces appear in the command palette as "Load Workspace: \<name>"
- **Delete**: Use "Delete Workspace: \<name>" from the command palette

Workspaces are stored as JSON files in `~/.ordis/workspaces/`. Each workspace captures the full layout tree and pane working directories.

## Terminal Profiles

Profiles are reusable presets defined in `~/.ordis/config.toml` under `[[profiles]]` sections. Each profile specifies a combination of working directory, agent type, and optional startup prompt.

Profiles appear in the command palette as "Launch Profile: \<name>". Selecting one creates a new pane with the profile's settings applied.

See [Getting Started](getting-started.md) for the profile configuration format.

## Command Palette

Press **Cmd+K** to open the command palette. It provides fuzzy search across all available actions:

- Split Pane Vertical / Horizontal
- Close Current Pane
- Toggle Pane Zoom
- Switch to Dashboard / Workspace
- Toggle Task Sidebar
- New Terminal Session
- Save Workspace As...
- Load Workspace: \<name> (for each saved workspace)
- Delete Workspace: \<name>
- Launch Profile: \<name> (for each configured profile)

Type to filter, use arrow keys to navigate, and press Enter to execute. Press Escape to dismiss.

## Notifications

Ordis displays toast notifications for errors, warnings, and informational messages. Toasts appear in the bottom-right corner:

- **Error** (red) -- persists until manually dismissed (click the x)
- **Warning** (amber) -- auto-dismisses after 5 seconds
- **Info** (blue) -- auto-dismisses after 3 seconds

Common notifications:
- Task operation failures (add, edit, delete, status change)
- PTY spawn failures
- WebGL renderer unavailable (falls back to slower canvas renderer)
- Missing limbo CLI (task features unavailable)
- Config parse errors on startup

## Keyboard Shortcuts

All shortcuts use the **Cmd** key (macOS):

| Shortcut | Action | Available in |
|----------|--------|--------------|
| **Cmd+K** | Open command palette | Anywhere |
| **Cmd+1** | Switch to Dashboard | Anywhere |
| **Cmd+2** | Switch to Workspace | Anywhere |
| **Cmd+B** | Toggle task sidebar | Anywhere |
| **Cmd+D** | Split pane vertically | Workspace |
| **Cmd+Shift+D** | Split pane horizontally | Workspace |
| **Cmd+Shift+Enter** | Toggle pane zoom | Workspace |
| **Cmd+F** | Search terminal scrollback | Workspace |
| **Cmd+W** | Close active pane | Workspace (only if multiple panes) |
| **Cmd+3** to **Cmd+9** | Focus pane by index | Workspace |

## Live Updates

Task data refreshes automatically. A background process polls limbo every 2 seconds. When tasks change -- whether from CLI activity, other agents, or another Ordis window -- the Dashboard and sidebar update in place without manual refresh.

The refresh button in the Dashboard header forces an immediate reload of all projects and their tasks.
