# Usage

Ordis has three views: **Dashboard** for project and task management, **Sessions** for multi-pane terminal and file viewing sessions, and **Settings** for Claude Code configuration.

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

### Dashboard Views

The Dashboard supports four view modes, toggled via icons in the header:

| View | Icon | Description |
|------|------|-------------|
| **List** (default) | List icon | Hierarchical task tree with parent-child nesting |
| **Kanban** | Board icon | Three columns (Todo, In Progress, Done) with draggable task cards |
| **Dependency Graph** | DAG icon | Visual directed graph of blocked-by relationships between tasks |
| **Timeline** | Timeline icon | Horizontal timeline showing task duration bars from created to updated |

View commands are also available in the command palette (Cmd+K).

### Kanban Board

The kanban view displays tasks as cards in three status columns. Drag a card between columns to change its status. Cards show task ID, name, and owner. Cards with a parent task display a small parent-ID badge. Tasks are grouped by project within each column.

### Dependency Graph

The dependency graph renders tasks with `blocked-by` relationships as a directed acyclic graph (DAG). Nodes are colored by status (gray=todo, purple=in-progress, green=done). The critical path (longest chain of incomplete tasks) is highlighted in amber.

**Interactions:** Scroll to zoom, drag to pan, click a node to select the task. Use the "Fit" button to auto-zoom to show all nodes.

### Task Timeline

The timeline view shows horizontal bars representing each task's duration from creation to last update (or now if still active). Tasks are grouped by project. The left column shows task names; the right area is a scrollable SVG timeline. Bar colors match task status.

**Interactions:** Hover a bar for a tooltip with dates and duration. Click to select. Mouse wheel scrolls horizontally; Cmd+wheel zooms. "Fit All" button auto-ranges to show all tasks.

### Bulk Operations

Select multiple tasks using the checkboxes on task rows (list view) or cards (kanban view). When tasks are selected, a bulk action bar appears at the bottom of the Dashboard with:

| Action | Description |
|--------|-------------|
| **Set Status** (todo / in-progress / done) | Change status of all selected tasks |
| **Delete** | Delete all selected tasks |
| **Select All** | Select all visible tasks |
| **Deselect All** | Clear selection |

### Task Templates

If task templates are configured in `~/.ordis/config.toml`, the add-task button (+) shows a template picker. Select a template to pre-fill all task fields (name, description, action, verify, result).

Templates are defined in config.toml:

```toml
[[templates]]
name = "Bug Fix"
description = "Fix a reported bug"
action = "Investigate root cause, implement fix, add regression test"
verify = "Bug no longer reproduces, tests pass"
result = "Root cause explanation and fix summary"
```

### Filtering and Search

The Dashboard header provides:

| Control | Purpose |
|---------|---------|
| Status filter buttons (All, Todo, In Progress, Done) | Show only tasks matching the selected status |
| Search input | Text search across task name, ID, action, and owner |
| Clear button (x) | Reset all filters |
| Refresh button | Reload projects and tasks from disk |

Filtering is hierarchical: when a child task matches, its entire ancestor chain is shown so you can see context.

## Sessions

The Sessions view is a multi-pane environment for terminals and file viewers. Terminal panes run independent Claude Code sessions. Viewer panes display files with syntax highlighting, markdown rendering, image zoom/pan, PDF pages, or git diffs.

### File Viewing

Open files in viewer panes alongside your terminal sessions:

- **Cmd+O** -- Open a file via native file picker dialog
- **Cmd+E** -- Toggle the file browser sidebar (tree view of the active pane's working directory)
- Click any file in the file browser to open it

Viewer types are auto-detected by file extension:

| Type | Extensions | Rendering |
|------|-----------|-----------|
| Code | `.rs`, `.ts`, `.tsx`, `.js`, `.py`, `.go`, `.toml`, `.json`, `.html`, `.css`, and 50+ more | Syntax-highlighted with Shiki |
| Markdown | `.md`, `.mdx`, `.markdown` | Rendered HTML |
| Image | `.png`, `.jpg`, `.gif`, `.svg`, `.webp`, `.avif`, and more | Zoom (scroll) and pan (drag) |
| PDF | `.pdf` | Page-by-page canvas rendering |
| Diff/Patch | `.diff`, `.patch` | Unified diff with added/removed line highlighting |

Viewer panes deduplicate -- opening the same file twice focuses the existing viewer instead of creating a new one. Viewer panes can be closed with **Cmd+W** even when they are the last pane (unlike terminal panes). Files over 5 MB are rejected; binary files are detected and skipped.

### Session Persistence

Ordis saves your pane layout, working directories, and viewer pane state (file paths, viewer types) to `~/.ordis/session.json` when the window closes. On next launch, the previous layout is automatically restored. If a saved session exists, Ordis opens directly to the Sessions view.

### Pane Management

**Creating panes:**
- Switch to Sessions (first visit auto-creates one pane)
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
- Press **Cmd+Shift+Enter** to temporarily maximize the focused pane to fill the entire view
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

Press **Cmd+B** to toggle the task sidebar in the Sessions view. It shows a compact task list for all projects, with:
- Clickable status dots for quick status cycling
- Task IDs and names
- Launch buttons to open tasks as new panes

The sidebar is independent of the Dashboard -- it provides lightweight task awareness while working in terminals.

### Artifact Sidebar

Press **Cmd+Shift+A** to toggle the artifact sidebar on the right side of the Sessions view. It tracks files touched by Claude Code during a session:

- **Write/Create** operations show a **+** icon with a "created" badge
- **Edit/Update** operations show a pencil icon with an "edited" badge
- **Read** operations show an eye icon with a "read" badge
- **Screenshots** show a square icon with a "screenshot" badge

Artifacts are listed newest-first. Each entry shows the filename, abbreviated path, and operation type. Click an entry to open a **popover preview** that renders the file using the appropriate viewer (code with syntax highlighting, markdown, images, or diffs).

**Diff toggle:** For edited files, the popover includes a "Diff" button that switches between the rendered file and a unified diff showing changes against the pre-edit content. Pre-edit snapshots are captured automatically when Claude reads a file before editing it.

Artifacts are capped at 200 entries with oldest-first eviction. Use the "Clear Session Artifacts" command (via Cmd+K) to reset the list manually.

### Status Bar

A fixed bar at the bottom of the Sessions view showing:

| Element | Description |
|---------|-------------|
| Session count | Number of active terminal panes (e.g., "3 sessions") |
| Project name | Name of the current project directory |
| Git branch | Branch name and dirty indicator (`*`) for the focused pane's CWD |

The status bar updates automatically when you switch focus between panes.

## Named Layouts

Save your current pane layout as a named layout for quick restoration later.

- **Save**: Open the command palette (**Cmd+K**) and select "Save Layout As..." — enter a name when prompted
- **Load**: Saved layouts appear in the command palette as "Load Layout: \<name>"
- **Delete**: Use "Delete Layout: \<name>" from the command palette

Layouts are stored as JSON files in `~/.ordis/layouts/`. Each layout captures the full layout tree and pane working directories.

## Terminal Profiles

Profiles are reusable presets defined in `~/.ordis/config.toml` under `[[profiles]]` sections. Each profile specifies a combination of working directory, agent type, and optional startup prompt.

Profiles appear in the command palette as "Launch Profile: \<name>". Selecting one creates a new pane with the profile's settings applied.

See [Getting Started](getting-started.md) for the profile configuration format.

## Settings

Press **Cmd+,** or click the **Settings** tab in the titlebar to open the Settings view. It manages Claude Code's `settings.json` and `CLAUDE.md` files through five panels:

### Permissions

Manage Claude Code's permission rules:

- **Allow rules** -- tool patterns that run without confirmation (e.g., `Bash(git *)`, `Read`)
- **Deny rules** -- tool patterns that are always blocked
- **Default mode** -- how unmatched tools are handled
- **Permission profiles** -- save and apply named sets of allow/deny rules. Profiles are stored in `~/.ordis/config.toml` under `[[permission_profiles]]` sections. Applying a profile merges its rules into the active settings.json.

### General

Toggle Claude Code behavior settings: thinking mode, voice, and effort level.

### Hooks

View, add, and remove hooks that run on Claude Code events. Supports all 7 event types (PreToolUse, PostToolUse, Notification, Stop, SubagentStop, UserPromptSubmit, Exit). Each hook has a matcher pattern and a command to execute.

### MCP Servers

Manage Model Context Protocol servers:

- Add servers with a command, arguments, and environment variables
- Enable/disable individual servers without removing them
- Remove servers

### CLAUDE.md

Discover and edit CLAUDE.md instruction files at three scopes:

- **Global** -- `~/.claude/CLAUDE.md`
- **Project root** -- `<project>/CLAUDE.md`
- **Project .claude** -- `<project>/.claude/CLAUDE.md`

Files that don't exist yet can be created from this panel. The editor shows which files exist and which are absent.

### Scope

Settings supports both **global** and **project** scope. Use the scope selector to switch between `~/.claude/settings.json` (global) and `<project>/.claude/settings.json` (project-level).

## Command Palette

Press **Cmd+K** to open the command palette. It provides fuzzy search across all available actions:

- Split Pane Vertical / Horizontal
- Close Current Pane
- Toggle Pane Zoom
- Switch to Dashboard / Sessions
- Open Settings
- Toggle Task Sidebar
- Toggle Artifact Sidebar
- Toggle File Browser
- Clear Session Artifacts
- Open File...
- New Terminal Session
- Switch to List View / Kanban View / Dependency Graph / Timeline
- Save Layout As...
- Load Layout: \<name> (for each saved layout)
- Delete Layout: \<name>
- Launch Profile: \<name> (for each configured profile)

Type to filter, use arrow keys to navigate, and press Enter to execute. Press Escape to dismiss.

## Notifications

### Desktop Notifications

Ordis sends native OS notifications when task statuses change externally (e.g., via `limbo` CLI or another agent). Notifications distinguish between "Task Completed" (status changed to done) and "Task Status Changed" (any other status transition). Notification permission is requested on first launch.

### Toast Notifications

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
| **Cmd+2** | Switch to Sessions | Anywhere |
| **Cmd+,** | Open Settings | Anywhere |
| **Cmd+B** | Toggle task sidebar | Anywhere |
| **Cmd+Shift+A** | Toggle artifact sidebar | Anywhere (switches to Sessions if not already there) |
| **Cmd+E** | Toggle file browser | Anywhere (switches to Sessions if not already there) |
| **Cmd+O** | Open file in viewer | Anywhere (opens native file picker) |
| **Cmd+D** | Split pane vertically | Sessions |
| **Cmd+Shift+D** | Split pane horizontally | Sessions |
| **Cmd+Shift+Enter** | Toggle pane zoom | Sessions |
| **Cmd+F** | Search terminal scrollback | Sessions |
| **Cmd+W** | Close active pane | Sessions (multiple panes required for terminals; viewer panes always closable) |
| **Cmd+3** to **Cmd+9** | Focus pane by index | Sessions |

## CLI Launch Command

External scripts can start Claude Code sessions in a running Ordis instance using the `ordis launch` subcommand:

```bash
ordis launch --cwd /path/to/project --agent "swe-team:tech-lead" --effort high --prompt "fix the auth bug"
```

| Flag | Default | Description |
|------|---------|-------------|
| `--cwd <path>` | Caller's working directory | Working directory for the session |
| `--agent <name>` | -- | Agent to use (e.g. `swe-team:tech-lead`) |
| `--effort <level>` | -- | Claude Code effort level: `low`, `medium`, `high`, or `max` |
| `--prompt <text>` | -- | Initial prompt. Also reads from stdin if not provided and stdin is a pipe |

**Behavior:**
- Connects to the running Ordis instance via unix socket (`/tmp/ordis.sock`)
- Ordis creates a new pane in the Sessions view with the specified session
- Fire-and-forget: the CLI exits immediately after receiving acknowledgement
- If Ordis is not running, prints an error and exits with code 1

**Piping prompts from stdin:**

```bash
echo "implement the login page" | ordis launch --cwd /path/to/project --effort high
```

**Example: limbo task dispatch loop:**

```bash
while true; do
  task=$(limbo next --json 2>/dev/null)
  if [ -z "$task" ]; then sleep 30; continue; fi
  id=$(echo "$task" | jq -r '.id')
  limbo claim "$id"
  ordis launch --cwd /path/to/project --agent "swe-team:project-manager" \
    --effort high --prompt "handle limbo task $id"
  sleep 5
done
```

Running `ordis` with no subcommand launches the GUI as normal.

## Live Updates

Task data refreshes automatically. A background process polls limbo every 2 seconds. When tasks change -- whether from CLI activity, other agents, or another Ordis window -- the Dashboard and sidebar update in place without manual refresh.

The refresh button in the Dashboard header forces an immediate reload of all projects and their tasks.
