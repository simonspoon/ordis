# Architecture

Ordis is a Tauri 2 desktop application that embeds Claude Code inside PTY-backed terminal panes. The frontend is SolidJS with xterm.js; the backend is Rust.

## Project Structure

```
ordis/
├── Cargo.toml              # Workspace root (edition 2024, v0.1.0)
├── app/
│   ├── package.json        # SolidJS + xterm.js + tauri-pty
│   ├── vite.config.ts      # Vite with vite-plugin-solid
│   ├── src/                # Frontend (SolidJS)
│   │   ├── index.tsx       # Entry point
│   │   ├── App.tsx         # Root component, view routing, keyboard shortcuts
│   │   ├── App.css         # All styles (single file)
│   │   ├── lib/
│   │   │   ├── store.ts    # Pane state, layout tree, split/close operations
│   │   │   └── tasks.ts    # Project/task state, limbo integration, mutations
│   │   └── components/
│   │       ├── Dashboard.tsx    # Project grid, task CRUD, filtering
│   │       ├── TerminalPane.tsx # xterm.js + PTY lifecycle per pane
│   │       ├── PaneBar.tsx      # Tab bar for workspace panes
│   │       ├── SplitDivider.tsx # Draggable split resize handles
│   │       └── TaskSidebar.tsx  # Collapsible task list in workspace view
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

Ordis reads `~/.ordis/config.toml` at startup. The config has two fields:

| Field | Type | Purpose |
|-------|------|---------|
| `default_cwd` | `Option<String>` | Default working directory for new panes. Supports `~` expansion. Falls back to `$HOME`. |
| `projects` | `Vec<{name, path}>` | Named project directories shown in the Dashboard. Each is checked for a `.limbo/` directory to determine task support. |

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

All mutation commands follow a pattern: run the limbo CLI as a subprocess, then call `fetch_tasks_for_project()` to return the full refreshed task list. The frontend replaces its entire task array for that project on each mutation response.

### Task Watcher

A background thread (`watch_tasks`) polls every 2 seconds:
1. Reads the config to get the project list
2. For each project with a `.limbo/` directory, runs `limbo list --show-all`
3. Compares JSON output against a `HashMap<String, String>` cache
4. If changed (and not the first poll), emits a `tasks-changed` Tauri event

This gives the frontend live updates when tasks change from external sources (CLI, other agents).

### Plugins

| Plugin | Version | Purpose |
|--------|---------|---------|
| `tauri-plugin-pty` | 0.2 | PTY process spawning for embedded terminals |
| `tauri-plugin-dialog` | 2 | Native folder picker dialogs |
| `tauri-plugin-shell` | 2 | Shell command execution |
| `tauri-plugin-opener` | 2 | URL/file opening |

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
- **Dividers are also flat**: `computeDividers()` produces position data for draggable resize handles overlaid on the terminal container.
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

Stored in a SolidJS reactive store (`Record<string, PaneState>`). Operations: `createPane`, `splitPane`, `closePane`, `setPaneCwd`.

### Terminal Lifecycle (TerminalPane.tsx)

Each `TerminalPane` on mount:
1. Creates an xterm.js `Terminal` with WebGL addon (falls back to canvas/DOM renderer on failure)
2. Spawns a PTY via `tauri-pty`: `/bin/zsh -l -c "claude --dangerously-skip-permissions [--agent X] [prompt]"`
3. Connects bidirectional data: PTY output to terminal display, terminal input to PTY
4. Attaches a `ResizeObserver` + `FitAddon` for auto-sizing on container resize
5. On PTY exit, auto-closes the pane via `closePane()`

Terminal theme uses a dark palette (`#1a1a2e` background) with 10,000 lines of scrollback.

### Task System (tasks.ts)

The task module manages:
- **Project discovery**: `loadProjects()` calls `list_projects`, then eagerly loads tasks for all limbo-enabled projects
- **Task CRUD**: `addTask`, `editTask`, `deleteTask`, `updateTaskStatus`, `addTaskNote` -- all invoke Tauri commands that shell out to limbo CLI
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
