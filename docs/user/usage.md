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

### Pane Toolbar

Each pane has a toolbar showing the current working directory (abbreviated with `~`). Click it to open a native folder picker and change the directory. Changing the directory sends a `cd` command to the running Claude Code session.

### Split Dividers

Drag the divider between split panes to resize them. Ratios are clamped between 15% and 85% to prevent invisible panes.

### Task Sidebar

Press **Cmd+B** to toggle the task sidebar in the Workspace view. It shows a compact task list for all projects, with:
- Clickable status dots for quick status cycling
- Task IDs and names
- Launch buttons to open tasks as new panes

The sidebar is independent of the Dashboard -- it provides lightweight task awareness while working in terminals.

## Keyboard Shortcuts

All shortcuts use the **Cmd** key (macOS):

| Shortcut | Action | Available in |
|----------|--------|--------------|
| **Cmd+1** | Switch to Dashboard | Anywhere |
| **Cmd+2** | Switch to Workspace | Anywhere |
| **Cmd+B** | Toggle task sidebar | Anywhere |
| **Cmd+D** | Split pane vertically | Workspace |
| **Cmd+Shift+D** | Split pane horizontally | Workspace |
| **Cmd+W** | Close active pane | Workspace (only if multiple panes) |
| **Cmd+3** to **Cmd+9** | Focus pane by index | Workspace |

## Live Updates

Task data refreshes automatically. A background process polls limbo every 2 seconds. When tasks change -- whether from CLI activity, other agents, or another Ordis window -- the Dashboard and sidebar update in place without manual refresh.

The refresh button in the Dashboard header forces an immediate reload of all projects and their tasks.
