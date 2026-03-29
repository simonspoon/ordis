# Getting Started

Install Ordis and run your first Claude Code session in a multi-pane desktop interface.

## Requirements

- **macOS** (primary target)
- **Claude Code CLI** installed and authenticated ([install guide](https://claude.ai/claude-code))
- **Rust** via [rustup](https://rustup.rs/) (edition 2024)
- **Node.js** LTS + [pnpm](https://pnpm.io/)

Optional:
- **limbo CLI** for task management features in the Dashboard (Ordis warns on startup if not found)

## Install

```bash
git clone https://github.com/simonspoon/ordis.git
cd ordis/app
pnpm install
```

## Configure

Create `~/.ordis/config.toml` to register your projects and set a default working directory:

```toml
# Default directory for new terminal panes (supports ~ expansion)
default_cwd = "~/projects"

# Projects shown in the Dashboard
[[projects]]
name = "my-app"
path = "~/projects/my-app"

[[projects]]
name = "another-project"
path = "~/work/another-project"

# Terminal profiles — reusable presets launchable from command palette
[[profiles]]
name = "ordis-dev"
cwd = "~/claudehub/ordis"
agent = "swe-team:project-manager"
prompt = "check the backlog"

[[profiles]]
name = "quick-review"
cwd = "~/projects/my-app"
agent = "swe-team:code-review-agent"
```

| Field | Required | Description |
|-------|----------|-------------|
| `default_cwd` | No | Starting directory for new panes. Defaults to `$HOME` if omitted or path doesn't exist. |
| `projects[].name` | Yes | Display name shown in the Dashboard |
| `projects[].path` | Yes | Absolute path to the project directory. Supports `~` for home directory. |
| `profiles[].name` | Yes | Display name for the profile (appears in command palette as "Launch Profile: \<name>") |
| `profiles[].cwd` | No | Working directory for the pane. Supports `~` expansion. |
| `profiles[].agent` | No | Agent type to use (e.g., `swe-team:project-manager`) |
| `profiles[].prompt` | No | Initial prompt to send to Claude Code on launch |

Projects that contain a `.limbo/` directory automatically get task management features (viewing, creating, editing, and launching tasks).

## Launch

```bash
cd ordis/app
pnpm tauri dev
```

This starts both the Vite dev server and the Tauri desktop window. Ordis opens to the **Dashboard** view.

## First Steps

### Dashboard

The Dashboard shows all projects from your config. Each project card displays:
- Task counts (todo, in progress, done) for limbo-enabled projects
- Expandable task tree with inline CRUD
- "No limbo" label for projects without `.limbo/`

Click a project card to expand its task list. Click the **+** button to add a task.

### Workspace

Switch to the Workspace by clicking the **Workspace** tab in the titlebar (or press **Cmd+2**). Ordis creates a terminal pane running Claude Code in your default working directory.

If you previously had a session open, Ordis restores your pane layout automatically on launch.

From there you can:
- **Split panes** to run multiple Claude sessions side by side
- **Drag tabs** to reorder panes
- **Zoom a pane** with **Cmd+Shift+Enter** to temporarily maximize it
- **Search terminal output** with **Cmd+F** to find text in scrollback
- **Select an agent** from the toolbar dropdown to change the agent type for a pane
- **Open the command palette** with **Cmd+K** to quickly find any action
- **Save/load workspaces** via the command palette to preserve named layouts
- **Launch a profile** from the command palette for one-click preset sessions
- **Change the working directory** of any pane via the folder button in the pane toolbar
- **Open the task sidebar** with **Cmd+B** for quick task reference while working

### Launching a Task

From either the Dashboard or the task sidebar, click the play button on any task. Ordis:
1. Creates a new terminal pane in the Workspace
2. Sets the working directory to the task's project path
3. Starts Claude Code with the `swe-team:project-manager` agent
4. Passes the task ID, name, and action as an initial prompt

This lets you go from task to working session in one click.

## Building for Production

```bash
cd ordis/app
pnpm tauri build
```

This produces a `.app` bundle in `app/src-tauri/target/release/bundle/`.
