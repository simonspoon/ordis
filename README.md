# Ordis

Desktop interface for [Claude Code](https://claude.ai/claude-code). Embeds Claude Code in a multi-pane terminal UI with per-pane working directories.

## How It Works

Ordis spawns Claude Code inside embedded PTY terminals (xterm.js). Each pane runs `claude --dangerously-skip-permissions` as a child process via `tauri-pty`, giving you the full Claude Code terminal experience in a native desktop window.

## Requirements

- [Claude Code CLI](https://claude.ai/claude-code) installed and authenticated
- Rust (via rustup)
- Node.js LTS + pnpm
- macOS (primary target)

## Development

```bash
cd app
pnpm install
pnpm tauri dev
```

## Architecture

```
ordis/
└── app/
    ├── src-tauri/   # Tauri backend — AppState, cwd commands, PTY plugin
    └── src/         # SolidJS frontend — pane management, xterm.js terminals
```

**Rust backend** manages working directory state, file I/O, Claude Code settings, and task management via limbo CLI. The `tauri-plugin-pty` plugin provides PTY support for embedded terminals.

**SolidJS frontend** manages terminal and viewer panes via a reactive store. Terminal panes embed xterm.js (with WebGL rendering) connected to PTY processes running Claude Code. Viewer panes render files with syntax highlighting, markdown, image zoom/pan, PDF pages, or git diffs.

## Features

- Embedded terminal running Claude Code via PTY
- Multi-pane support — run multiple Claude sessions side by side
- File and document viewing — code (Shiki), markdown, images (zoom/pan), PDFs, and git diffs in viewer panes
- File browser sidebar — browse and open project files with Cmd+E
- Claude Code settings management — permissions, hooks, MCP servers, and CLAUDE.md editing via Settings view (Cmd+,)
- Permission profiles — save and apply reusable allow/deny rule sets
- Drag-and-drop pane reordering via tab headers
- Pane zoom — temporarily maximize any pane with Cmd+Shift+Enter
- Terminal search — Cmd+F to search within terminal scrollback
- Agent selector — pick agent type per pane from toolbar dropdown
- Named workspaces — save/load pane layouts (stored in `~/.ordis/workspaces/`)
- Terminal profiles — reusable cwd + agent + prompt presets in config.toml
- Git integration — branch, dirty status, and ahead/behind in pane toolbar and status bar
- Status bar — session count, project name, and git info at bottom of workspace
- Command palette — Cmd+K fuzzy launcher for all actions
- Session persistence — layout, terminal, and viewer pane state restored on launch
- Toast notifications — error, warning, and info feedback
- Per-pane working directory with folder picker
- Graceful degradation — warns about missing limbo CLI, WebGL, or config errors
- Dark theme

## License

MIT
