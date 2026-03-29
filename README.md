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

**Rust backend** manages a shared working directory state and exposes `get_cwd`/`set_cwd` commands. The `tauri-plugin-pty` plugin provides PTY support for embedded terminals.

**SolidJS frontend** manages multiple terminal panes via a reactive store. Each pane embeds an xterm.js terminal (with WebGL rendering) connected to a PTY process running Claude Code.

## Features

- Embedded terminal running Claude Code via PTY
- Multi-pane support — run multiple Claude sessions side by side
- Pane zoom — temporarily maximize any pane with Cmd+Shift+Enter
- Command palette — Cmd+K fuzzy launcher for all actions
- Session persistence — layout and pane state restored on launch
- Toast notifications — error, warning, and info feedback
- Per-pane working directory with folder picker
- Graceful degradation — warns about missing limbo CLI, WebGL, or config errors
- Dark theme

## License

MIT
