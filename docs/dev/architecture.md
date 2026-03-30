# Architecture

Ordis is a Tauri 2 desktop application that embeds Claude Code inside PTY-backed terminal panes. The frontend is SolidJS with xterm.js; the backend is Rust.

## Project Structure

```
ordis/
├── Cargo.toml              # Workspace root (edition 2024)
├── app/
│   ├── package.json        # SolidJS + xterm.js + tauri-pty
│   ├── vite.config.ts      # Vite with vite-plugin-solid
│   ├── src/                # Frontend (SolidJS)
│   │   ├── index.tsx       # Entry point
│   │   ├── App.tsx         # Root component, view routing, keyboard shortcuts
│   │   ├── App.css         # All styles (single file)
│   │   ├── lib/
│   │   │   ├── store.ts    # Pane state, layout tree, zoom, session persistence
│   │   │   ├── tasks.ts    # Project/task state, limbo integration, mutations
│   │   │   ├── toast.ts    # Toast notification state and actions
│   │   │   └── commands.ts # Command palette registry
│   │   └── components/
│   │       ├── Dashboard.tsx      # Project grid, task CRUD, filtering, view toggle
│   │       ├── KanbanBoard.tsx    # Kanban board view (todo/in-progress/done columns)
│   │       ├── DependencyGraph.tsx # DAG visualization of task blocked-by relationships
│   │       ├── TaskTimeline.tsx   # Horizontal timeline view with duration bars
│   │       ├── TerminalPane.tsx   # xterm.js + PTY lifecycle per pane
│   │       ├── PaneBar.tsx        # Tab bar with zoom indicator, drag-and-drop reordering
│   │       ├── StatusBar.tsx      # Bottom status bar (session count, project, git branch)
│   │       ├── SplitDivider.tsx   # Draggable split resize handles
│   │       ├── TaskSidebar.tsx    # Collapsible task list in workspace view
│   │       ├── Toast.tsx          # Toast notification container
│   │       └── CommandPalette.tsx # Cmd+K fuzzy-search command launcher
│   └── src-tauri/          # Backend (Rust)
│       ├── Cargo.toml      # Crate: ordis (staticlib + cdylib + rlib)
│       ├── tauri.conf.json # App config, CSP, window defaults
│       └── src/
│           ├── main.rs     # Entry point (calls lib::run)
│           └── lib.rs      # All backend logic: config, commands, watcher
└── .github/workflows/
    ├── ci.yml              # cargo check/test/clippy + pnpm tsc --noEmit
    └── release.yml         # Release builds
```

## Backend (Rust)

All backend logic lives in `app/src-tauri/src/lib.rs`. There is no module splitting yet.

### Configuration

Ordis reads `~/.ordis/config.toml` at startup. The config has three top-level fields:

| Field | Type | Purpose |
|-------|------|---------|
| `default_cwd` | `Option<String>` | Default working directory for new panes. Supports `~` expansion. Falls back to `$HOME`. |
| `projects` | `Vec<{name, path}>` | Named project directories shown in the Dashboard. Each is checked for a `.limbo/` directory to determine task support. |
| `profiles` | `Vec<{name, cwd?, agent?, prompt?}>` | Terminal profiles — reusable presets launchable from the command palette. |
| `templates` | `Vec<{name, description, action, verify, result}>` | Task templates — presets for common task types (bug fix, feature, review). Shown in the add-task template picker. |

### Tauri Commands

These are the IPC commands exposed to the frontend via `tauri::generate_handler!`:

| Command | Arguments | Returns | Purpose |
|---------|-----------|---------|---------|
| `get_cwd` | -- | `String` | Current default working directory |
| `set_cwd` | `cwd: String` | `()` | Update default cwd (validates path exists) |
| `list_projects` | -- | `Vec<Project>` | Load projects from config, check for `.limbo/` |
| `list_tasks` | `project_path` | `Vec<Task>` | Run `limbo list --show-all` in project dir, parse JSON |
| `get_task` | `project_path, task_id` | `Task` | Run `limbo show <id>`, parse JSON |
| `update_task_status` | `project_path, task_id, status, outcome?` | `Vec<Task>` | Run `limbo status`, return refreshed task list |
| `add_task` | `project_path, name, description?, action?, verify?, result?, parent?` | `Vec<Task>` | Run `limbo add`, return refreshed task list |
| `edit_task` | `project_path, task_id, name?, description?, action?, verify?, result?` | `Vec<Task>` | Run `limbo edit`, return refreshed task list |
| `add_task_note` | `project_path, task_id, message` | `Vec<Task>` | Run `limbo note`, return refreshed task list |
| `delete_task` | `project_path, task_id` | `Vec<Task>` | Run `limbo delete`, return refreshed task list |
| `block_task` | `project_path, blocker_id, blocked_id` | `Vec<Task>` | Run `limbo block`, return refreshed task list |
| `unblock_task` | `project_path, blocker_id, blocked_id` | `Vec<Task>` | Run `limbo unblock`, return refreshed task list |
| `list_templates` | -- | `Vec<TaskTemplate>` | Load task templates from config.toml |
| `check_startup` | -- | `StartupChecks` | Check limbo availability and validate config.toml |
| `save_session` | `data: String` | `()` | Write session JSON to `~/.ordis/session.json` |
| `load_session` | -- | `Option<String>` | Read session JSON from `~/.ordis/session.json` |
| `get_git_info` | `path: String` | `Option<GitInfo>` | Get branch, dirty status, ahead/behind for a path. Returns `None` if not a git repo. |
| `list_profiles` | -- | `Vec<Profile>` | Load profiles from config.toml with tilde expansion on cwd |
| `list_agents` | -- | `Vec<String>` | Scan `~/.claude/agents/` and plugin cache for available agent `.md` files |
| `list_workspaces` | -- | `Vec<String>` | List saved workspace names from `~/.ordis/workspaces/*.json` |
| `save_workspace` | `name, data` | `()` | Save workspace layout JSON to `~/.ordis/workspaces/<name>.json` |
| `load_workspace` | `name: String` | `Option<String>` | Load workspace layout JSON by name |
| `delete_workspace` | `name: String` | `()` | Delete a saved workspace file |

All mutation commands follow a pattern: run the limbo CLI as a subprocess, then call `fetch_tasks_for_project()` to return the full refreshed task list. The frontend replaces its entire task array for that project on each mutation response.

### Task Watcher

A background thread (`watch_tasks`) polls every 2 seconds:
1. Reads the config to get the project list
2. For each project with a `.limbo/` directory, runs `limbo list --show-all`
3. Compares JSON output against a `HashMap<String, String>` cache
4. If changed (and not the first poll), emits a `tasks-changed` Tauri event
5. Diffs old vs new task statuses — sends a desktop notification via `tauri-plugin-notification` when any task's status changes (title distinguishes "Task Completed" vs "Task Status Changed")

This gives the frontend live updates when tasks change from external sources (CLI, other agents).

### Plugins

| Plugin | Version | Purpose |
|--------|---------|---------|
| `tauri-plugin-pty` | 0.2 | PTY process spawning for embedded terminals |
| `tauri-plugin-dialog` | 2 | Native folder picker dialogs |
| `tauri-plugin-shell` | 2 | Shell command execution |
| `tauri-plugin-opener` | 2 | URL/file opening |
| `tauri-plugin-notification` | 2 | Desktop notifications for task status changes |

### App State

`AppState` holds a single `Mutex<PathBuf>` for the default working directory. Initialized from config's `default_cwd` (or `$HOME`).

## Frontend (SolidJS)

### View Modes

The app has two top-level views, toggled via the titlebar:

| View | Component | Description |
|------|-----------|-------------|
| Dashboard | `Dashboard.tsx` | Project grid with task CRUD, filtering, and search |
| Workspace | `App.tsx` (layout rendering) | Multi-pane terminal workspace with optional task sidebar |

`viewMode` signal lives in `tasks.ts` and defaults to `"dashboard"`.

### Layout Tree (store.ts)

Pane positioning uses a recursive binary tree:

```typescript
type LayoutNode =
  | { type: "leaf"; paneId: string }
  | { type: "split"; id: string; direction: "horizontal" | "vertical";
      first: LayoutNode; second: LayoutNode; ratio: number };
```

Key design decisions:
- **Flat DOM positioning**: Panes are not nested in the DOM. `computePositions()` walks the tree and produces `{x, y, w, h}` rects (0-1 normalized), applied as percentage CSS.
- **Zoom override**: `computeEffectivePositions()` wraps `computePositions()`. When a pane is zoomed, the zoomed pane gets `{0,0,1,1}` and all others get `{0,0,0,0}` (hidden via CSS visibility).
- **Dividers are also flat**: `computeDividers()` produces position data for draggable resize handles overlaid on the terminal container. Dividers are hidden when a pane is zoomed.
- **Split ratio clamping**: `updateSplitRatio()` clamps to [0.15, 0.85] to prevent invisible panes.

### Pane State (store.ts)

```typescript
interface PaneState {
  id: string;       // crypto.randomUUID()
  cwd: string;      // Working directory
  agent?: string;   // Optional agent name (e.g., "swe-team:project-manager")
  prompt?: string;  // Optional initial prompt
}
```

Stored in a SolidJS reactive store (`Record<string, PaneState>`). Operations: `createPane`, `splitPane`, `closePane`, `setPaneCwd`, `toggleZoom`, `swapPanes`, `saveSession`, `restoreSession`.

### Terminal Lifecycle (TerminalPane.tsx)

Each `TerminalPane` on mount:
1. Creates an xterm.js `Terminal` with WebGL addon (falls back to canvas/DOM renderer on failure, shows a warning toast)
2. Spawns a PTY via `tauri-pty`: `/bin/zsh -l -c "claude --dangerously-skip-permissions [--agent X] [prompt]"`
3. Connects bidirectional data: PTY output to terminal display, terminal input to PTY
4. Attaches a `ResizeObserver` + `FitAddon` for auto-sizing on container resize
5. On PTY exit, auto-closes the pane via `closePane()`

Terminal theme uses a dark palette (`#1a1a2e` background) with 10,000 lines of scrollback.

### Task System (tasks.ts)

The task module manages:
- **Project discovery**: `loadProjects()` calls `list_projects`, then eagerly loads tasks for all limbo-enabled projects
- **Task CRUD**: `addTask`, `editTask`, `deleteTask`, `updateTaskStatus`, `addTaskNote` -- all invoke Tauri commands that shell out to limbo CLI. All mutations are wrapped in try/catch with toast error reporting.
- **Dependencies**: `blockTask`, `unblockTask` -- manage blocked-by relationships between tasks via `limbo block`/`unblock`
- **Templates**: `loadTemplates()` fetches task templates from config.toml via `list_templates` command
- **Bulk operations**: `selectedTasks` signal (`Set<string>`), `toggleTaskSelection`, `selectAllTasks`, `clearSelection` helpers. Bulk status change and delete execute sequentially via existing mutations.
- **Dashboard views**: `dashboardView` signal controls which sub-view renders: `"list"` (default tree), `"kanban"` (3-column board), `"graph"` (dependency DAG), `"timeline"` (horizontal duration bars)
- **Filtering**: `statusFilter` (all/todo/in-progress/done) and `searchFilter` (text search across name, id, action, owner)
- **Filtered tree traversal**: `getFilteredRootTasks` / `getFilteredChildTasks` walk ancestors upward so matching child tasks always have their parent chain visible
- **Live updates**: `setupTaskListener()` subscribes to `tasks-changed` events from the backend watcher thread
- **Task launch**: Dashboard and sidebar can launch a task as a new workspace pane with agent context (`swe-team:project-manager`) and a prompt containing the task ID, name, and action

### Data Flow

```
~/.ordis/config.toml
        |
        v
   Rust: load_config()
        |
   +----+----+
   |         |
   v         v
get_cwd   list_projects --> Frontend: loadProjects()
              |                       |
              v                       v
         list_tasks <---- loadTasksForProject()
              |
              v
      limbo CLI (subprocess)
              |
              v
      JSON task data --> Frontend store --> Reactive UI

Background:
  watch_tasks (2s poll) --> tasks-changed event --> Frontend store update
```
