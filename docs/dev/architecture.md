# Architecture

Ordis is a Tauri 2 desktop application that embeds Claude Code inside PTY-backed terminal panes. The frontend is SolidJS with xterm.js; the backend is Rust.

## Project Structure

```
ordis/
├── Cargo.toml              # Workspace root (edition 2024)
├── app/
│   ├── package.json        # SolidJS + xterm.js + tauri-pty
│   ├── vite.config.ts      # Vite with vite-plugin-solid
│   ├── vitest.config.ts    # Vitest test configuration (node environment)
│   ├── src/                # Frontend (SolidJS)
│   │   ├── index.tsx       # Entry point
│   │   ├── App.tsx         # Root component, view routing, keyboard shortcuts
│   │   ├── App.css         # All styles (single file)
│   │   ├── lib/
│   │   │   ├── store.ts    # Pane state, layout tree, zoom, session persistence
│   │   │   ├── tasks.ts    # Project/task state, limbo integration, mutations
│   │   │   ├── toast.ts    # Toast notification state and actions
│   │   │   ├── commands.ts # Command palette registry
│   │   │   ├── artifacts.ts     # Artifact store (reactive state, CRUD, LRU eviction)
│   │   │   └── artifactParser.ts # Terminal output parser (ANSI stripping, tool detection)
│   │   └── components/
│   │       ├── Dashboard.tsx      # Project grid, task CRUD, filtering, view toggle
│   │       ├── KanbanBoard.tsx    # Kanban board view (todo/in-progress/done columns)
│   │       ├── DependencyGraph.tsx # DAG visualization of task blocked-by relationships
│   │       ├── TaskTimeline.tsx   # Horizontal timeline view with duration bars
│   │       ├── TerminalPane.tsx   # xterm.js + PTY lifecycle per pane
│   │       ├── ViewerPane.tsx     # Routes file to correct viewer component by type
│   │       ├── CodeViewer.tsx     # Syntax-highlighted code viewer (Shiki)
│   │       ├── MarkdownViewer.tsx # Rendered markdown viewer (marked)
│   │       ├── ImageViewer.tsx    # Image viewer with zoom and pan
│   │       ├── PdfViewer.tsx      # PDF viewer (pdf.js)
│   │       ├── DiffViewer.tsx     # Git diff viewer with unified diff display
│   │       ├── FileBrowser.tsx    # File tree sidebar for browsing project files
│   │       ├── Settings.tsx       # Claude Code settings editor (5 panels)
│   │       ├── PaneBar.tsx        # Tab bar with zoom indicator, drag-and-drop reordering
│   │       ├── StatusBar.tsx      # Bottom status bar (session count, project, git branch)
│   │       ├── SplitDivider.tsx   # Draggable split resize handles
│   │       ├── TaskSidebar.tsx    # Collapsible task list in workspace view
│   │       ├── ArtifactSidebar.tsx # Collapsible artifact list (right side of workspace)
│   │       ├── ArtifactPopover.tsx # Popover overlay with viewer dispatch + diff toggle
│   │       ├── Toast.tsx          # Toast notification container
│   │       └── CommandPalette.tsx # Cmd+K fuzzy-search command launcher
│   └── src-tauri/          # Backend (Rust)
│       ├── Cargo.toml      # Crate: ordis (staticlib + cdylib + rlib)
│       ├── tauri.conf.json # App config, CSP, window defaults
│       └── src/
│           ├── main.rs     # Entry point: clap CLI parsing, routes to GUI or launch client
│           └── lib.rs      # All backend logic: config, commands, watcher, socket IPC
└── .github/workflows/
    ├── ci.yml              # cargo check/test/clippy + pnpm tsc --noEmit
    └── release.yml         # Release builds
```

## Backend (Rust)

All backend logic lives in `app/src-tauri/src/lib.rs`. There is no module splitting yet. The CLI entry point (`main.rs`) uses `clap` to parse subcommands — `ordis launch` routes to the IPC client; no subcommand routes to `ordis_lib::run()` (GUI mode).

### Configuration

Ordis reads `~/.ordis/config.toml` at startup. The config has three top-level fields:

| Field | Type | Purpose |
|-------|------|---------|
| `default_cwd` | `Option<String>` | Default working directory for new panes. Supports `~` expansion. Falls back to `$HOME`. |
| `projects` | `Vec<{name, path}>` | Named project directories shown in the Dashboard. Each is checked for a `.limbo/` directory to determine task support. |
| `profiles` | `Vec<{name, cwd?, agent?, prompt?}>` | Terminal profiles — reusable presets launchable from the command palette. |
| `templates` | `Vec<{name, description, action, verify, result}>` | Task templates — presets for common task types (bug fix, feature, review). Shown in the add-task template picker. |
| `permission_profiles` | `Vec<{name, allow, deny, default_mode?}>` | Permission profiles — reusable allow/deny rule sets that can be applied to `~/.claude/settings.json`. |

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
| `read_file` | `path: String` | `FileContent` | Read a file (text, image as base64, or PDF as base64). 5 MB limit. Rejects binary files. |
| `snapshot_file` | `path: String` | `FileContent` | Alias for `read_file` — semantic intent is pre-edit snapshot for diff comparison |
| `compute_diff` | `old_content, new_content, file_path` | `String` | Compute unified diff between two strings using the `similar` crate (3-line context radius) |
| `list_directory` | `path: String` | `Vec<DirEntry>` | List directory contents sorted directories-first then alphabetically |
| `detect_file_type` | `path: String` | `String` | Return viewer type for a file extension (`code`, `markdown`, `image`, `pdf`, `diff`) |
| `get_git_diff` | `path, file_path?` | `String` | Run `git diff` in a directory, optionally scoped to a single file |
| `read_claude_settings` | -- | `String` | Read `~/.claude/settings.json` (returns `{}` if missing) |
| `write_claude_settings` | `data: String` | `()` | Write `~/.claude/settings.json` (validates JSON) |
| `read_project_settings` | `project_path: String` | `String` | Read `<project>/.claude/settings.json` (returns `{}` if missing) |
| `write_project_settings` | `project_path, data` | `()` | Write `<project>/.claude/settings.json` (validates JSON) |
| `list_claude_md_files` | `project_path?` | `Vec<ClaudeMdFile>` | Discover CLAUDE.md files at global, project root, and project `.claude/` scopes |
| `read_claude_md` | `path: String` | `String` | Read a CLAUDE.md file (returns empty string if missing) |
| `write_claude_md` | `path, content` | `()` | Write a CLAUDE.md file (creates parent directories) |
| `list_permission_profiles` | -- | `Vec<PermissionProfile>` | Load permission profiles from config.toml |
| `save_permission_profiles` | `profiles_json: String` | `()` | Save permission profiles to config.toml (replaces `permission_profiles` section) |
| `apply_permission_profile` | `profile_name: String` | `()` | Merge a named profile's allow/deny/defaultMode into `~/.claude/settings.json` |

All mutation commands follow a pattern: run the limbo CLI as a subprocess, then call `fetch_tasks_for_project()` to return the full refreshed task list. The frontend replaces its entire task array for that project on each mutation response.

### Socket IPC (CLI Launch)

Ordis starts a unix domain socket listener at `/tmp/ordis.sock` on startup (in `start_socket_listener()`). The listener runs in a background thread and accepts JSON `LaunchRequest` payloads:

```rust
struct LaunchRequest {
    cwd: String,
    agent: Option<String>,
    effort: Option<String>,
    prompt: Option<String>,
}
```

On receipt, it emits a `launch-session` Tauri event with the request as payload, then writes `"ok"` as an ack. The frontend listens for this event in `App.tsx`, switches to workspace view, and calls `createPane()` with the launch parameters.

The CLI client (`launch_client()` in lib.rs) connects to the socket, sends JSON, reads the ack, and exits. If the connection fails, it prints an error and exits with code 1.

Stale sockets are cleaned up on startup (removed before bind). The socket is removed after `tauri::Builder::run()` returns.

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
| `similar` | 2 | Text diffing for artifact pre-edit vs post-edit comparison |
| `clap` | 4 (derive) | CLI argument parsing for `ordis launch` subcommand |

### App State

`AppState` holds a single `Mutex<PathBuf>` for the default working directory. Initialized from config's `default_cwd` (or `$HOME`).

## Frontend (SolidJS)

### View Modes

The app has three top-level views, toggled via the titlebar:

| View | Component | Description |
|------|-----------|-------------|
| Dashboard | `Dashboard.tsx` | Project grid with task CRUD, filtering, and search |
| Workspace | `App.tsx` (layout rendering) | Multi-pane terminal and viewer workspace with task sidebar and file browser |
| Settings | `Settings.tsx` | Claude Code settings editor with 5 panels |

`viewMode` signal lives in `tasks.ts` and defaults to `"dashboard"`. Type is `"dashboard" | "workspace" | "settings"`.

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
type PaneType = "terminal" | "viewer";
type ViewerType = "code" | "markdown" | "image" | "pdf" | "diff";

interface PaneState {
  id: string;           // crypto.randomUUID()
  cwd: string;          // Working directory
  paneType: PaneType;   // Terminal or file viewer
  agent?: string;       // Optional agent name (terminal panes only)
  effort?: string;      // Optional effort level: low|medium|high|max (terminal panes only)
  prompt?: string;      // Optional initial prompt (terminal panes only)
  viewerType?: ViewerType; // Which viewer to render (viewer panes only)
  filePath?: string;    // Absolute path to the file (viewer panes only)
  fileLabel?: string;   // Filename shown in the tab bar (viewer panes only)
}
```

Stored in a SolidJS reactive store (`Record<string, PaneState>`). Operations: `createPane`, `createViewerPane`, `splitPane`, `closePane`, `setPaneCwd`, `toggleZoom`, `swapPanes`, `saveSession`, `restoreSession`. `createViewerPane` deduplicates by file path -- if a viewer for the same file already exists, it focuses that pane instead of creating a new one. Session and workspace persistence includes viewer pane state (type, file path, viewer type).

### Terminal Lifecycle (TerminalPane.tsx)

Each `TerminalPane` on mount:
1. Creates an xterm.js `Terminal` with WebGL addon (falls back to canvas/DOM renderer on failure, shows a warning toast)
2. Spawns a PTY via `tauri-pty`: `/bin/zsh -l -c "claude --dangerously-skip-permissions [--agent X] [--effort Y] [prompt]"`
3. Connects bidirectional data: PTY output to terminal display, terminal input to PTY
4. Attaches a `ResizeObserver` + `FitAddon` for auto-sizing on container resize
5. On PTY exit, auto-closes the pane via `closePane()`

Terminal theme uses a dark palette (`#1a1a2e` background) with 10,000 lines of scrollback.

The PTY data handler also feeds output through the artifact parser (`artifactParser.ts`) line by line. When a Claude Code tool operation is detected (Write, Edit, Read, Screenshot), the file is added to the artifact store. For Read operations, a pre-edit snapshot is captured immediately via `snapshot_file` so the content is available for diff comparison when a subsequent Edit is detected.

**Gotcha:** Data from `tauri-pty`'s `onData` callback is not a standard `Uint8Array`. It must be wrapped with `new Uint8Array(data)` before passing to `TextDecoder.decode()` or any API that expects a typed array. The existing `term.write(new Uint8Array(data))` call already does this for xterm.js.

### Artifact System (artifacts.ts, artifactParser.ts)

The artifact system detects files touched by Claude Code during a terminal session and displays them in a sidebar.

**Parser (`artifactParser.ts`):** Strips ANSI escape sequences from PTY output, extracts file paths, and matches against tool-operation patterns (Write/Created, Edit/Updated, Read, Screenshot). Rejects system paths (`/dev/`, `/proc/`, `/sys/`). Read operations require a known source file extension to reduce false positives. Path matches are capped at 512 characters.

**Store (`artifacts.ts`):** SolidJS reactive store keyed by artifact ID. Deduplicates by file path -- re-editing the same file updates the existing entry. `preEditContent` is stored in a separate `Map` (outside the reactive store) to avoid diffing overhead on large strings. Capped at 200 entries with oldest-first eviction.

**Sidebar (`ArtifactSidebar.tsx`):** 260px collapsible panel on the right side of the workspace (toggled with Cmd+Shift+A). Lists artifacts newest-first with operation icons and badges.

**Popover (`ArtifactPopover.tsx`):** Overlay that lazy-loads the appropriate viewer component (CodeViewer, MarkdownViewer, ImageViewer, DiffViewer). For edited files with pre-edit content, a toggle switches between rendered view and unified diff. Dismissable via backdrop click, close button, or Escape.

### Viewer Panes (ViewerPane.tsx)

Viewer panes display files instead of terminals. `ViewerPane` reads `paneType` and `viewerType` from the pane state and routes to the appropriate viewer component:

| ViewerType | Component | Rendering |
|------------|-----------|-----------|
| `code` | `CodeViewer` | Syntax highlighting via Shiki. Supports 60+ languages by extension. |
| `markdown` | `MarkdownViewer` | HTML rendering via marked. |
| `image` | `ImageViewer` | Base64 data URL with zoom (scroll) and pan (drag). |
| `pdf` | `PdfViewer` | Page-by-page rendering via pdf.js canvas. |
| `diff` | `DiffViewer` | Unified diff display with added/removed line highlighting. |

Files are loaded via the `read_file` backend command. Images and PDFs are base64-encoded by the backend. Text files have a 5 MB limit and binary detection (null-byte scan of first 8 KB).

### File Browser (FileBrowser.tsx)

A sidebar panel toggled with **Cmd+E**. Displays a tree of files and directories starting from the active pane's working directory. Clicking a file opens it in a viewer pane (via `createViewerPane`). Directories expand/collapse inline. Entries are sorted directories-first, then alphabetically.

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

### Settings (Settings.tsx)

The Settings view manages Claude Code configuration through five panels:

| Panel | Settings Target | Description |
|-------|----------------|-------------|
| Permissions | `~/.claude/settings.json` | Manage allow/deny rules and defaultMode. Apply/save permission profiles from config.toml. |
| General | `~/.claude/settings.json` | Toggle thinking mode, voice, effort level. |
| Hooks | `~/.claude/settings.json` | View, add, and remove hooks across 7 event types (PreToolUse, PostToolUse, etc.). |
| MCP Servers | `~/.claude/settings.json` | Add, remove, and disable MCP servers with command, args, and environment variables. |
| CLAUDE.md | CLAUDE.md files | Discover and edit CLAUDE.md at global (`~/.claude/`), project root, and project `.claude/` scopes. |

Settings supports both global and project scope. The scope selector switches between `~/.claude/settings.json` and `<project>/.claude/settings.json`. CLAUDE.md editing discovers all three possible file locations and creates parent directories on save.

Permission profiles are stored in `~/.ordis/config.toml` under `[[permission_profiles]]` sections. Applying a profile merges its allow/deny/defaultMode into the active settings.json.

### Command Registry (commands.ts)

The command registry stores all palette-accessible actions. Commands are stored in a reactive `createSignal<Command[]>` (not a mutable array) so the command palette re-renders when commands are registered asynchronously (e.g., after profiles and workspaces load).

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
