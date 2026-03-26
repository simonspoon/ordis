# Ordis

Desktop interface for [Claude Code](https://claude.ai/claude-code). Renders Claude Code output in a chat UI with markdown, syntax highlighting, collapsible tool calls, and streaming.

## How It Works

Ordis wraps the Claude Code CLI using `--output-format stream-json`. Each message spawns a `claude -p` process; subsequent messages resume the session via `--resume <session_id>`.

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
├── crates/
│   ├── protocol/    # Serde types for Claude Code NDJSON events
│   └── process/     # Child process spawn, stdout reader, event channel
└── app/
    ├── src-tauri/   # Tauri backend — AppState, commands, event forwarding
    └── src/         # SolidJS frontend — chat UI, markdown, shiki highlighting
```

**Rust backend** spawns `claude -p --output-format stream-json --include-partial-messages` as a child process per turn. NDJSON events are parsed into typed `ClaudeEvent` variants and forwarded to the frontend via Tauri events.

**SolidJS frontend** accumulates streaming deltas into a reactive store and renders messages with:
- Markdown with syntax-highlighted code blocks (shiki)
- Collapsible thinking sections
- Collapsible tool call/result blocks (color-coded by tool type)
- Cost and token tracking in the status bar

## Features

- Streaming chat interface
- Session continuity via `--resume`
- Skip Permissions toggle (`--dangerously-skip-permissions`)
- New Session button
- Stop generation
- Dark theme

## License

MIT
