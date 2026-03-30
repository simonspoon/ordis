# Contributing

How to set up the development environment, add features, and run checks.

## Prerequisites

- [Claude Code CLI](https://claude.ai/claude-code) installed and authenticated
- Rust (via rustup, edition 2024)
- Node.js LTS + pnpm
- macOS (primary target -- PTY plugin uses native APIs)
- [limbo CLI](https://github.com/claudehub/limbo) (optional, for task management features)

## Development Setup

```bash
# Clone
git clone https://github.com/simonspoon/ordis.git
cd ordis

# Install frontend dependencies
cd app
pnpm install

# Run in dev mode (starts both Vite dev server and Tauri)
pnpm tauri dev
```

`pnpm tauri dev` starts Vite on `http://localhost:1420` and launches the Tauri native window. Hot reload works for frontend changes; Rust changes trigger a rebuild.

## Project Layout

| Area | Path | Language |
|------|------|----------|
| Frontend | `app/src/` | TypeScript (SolidJS) |
| Backend | `app/src-tauri/src/` | Rust |
| Styles | `app/src/App.css` | CSS (single file) |
| Config | `app/src-tauri/tauri.conf.json` | Tauri app config |

See [architecture.md](architecture.md) for detailed module descriptions.

## Adding a Feature

### Adding a new Tauri command

1. Add the command function in `app/src-tauri/src/lib.rs` with `#[tauri::command]`
2. Register it in the `invoke_handler` array in `run()`
3. Call it from the frontend with `invoke<ReturnType>("command_name", { args })`

### Adding a new frontend component

1. Create the component in `app/src/components/`
2. If it needs shared state, add signals/stores to the appropriate lib file:
   - `lib/store.ts` -- pane state, layout tree, zoom, session persistence
   - `lib/tasks.ts` -- project and task state
   - `lib/toast.ts` -- toast notification state and actions
   - `lib/commands.ts` -- command palette registry
3. Import and render from `App.tsx` or the relevant parent component
4. Add styles to `app/src/App.css`

### Adding a new view mode

1. Extend the `ViewMode` type in `lib/tasks.ts` (currently `"dashboard" | "workspace" | "settings"`)
2. Add a titlebar tab in `App.tsx`
3. Add a `<Show when={viewMode() === "newmode"}>` block in `App.tsx`
4. Add keyboard shortcut if desired (follow the `Cmd+N` pattern)
5. Register a command in the `onMount` block in `App.tsx` for command palette access

### Adding a new viewer type

1. Add the type to the `ViewerType` union in `lib/store.ts`
2. Add file extension mappings in `detect_viewer_type()` in `lib.rs`
3. Create a viewer component in `app/src/components/`
4. Add a routing case in `ViewerPane.tsx`

### Modifying the layout system

The layout tree is a recursive `LayoutNode` type in `lib/store.ts`. If adding a new split type or layout feature:
1. Extend the `LayoutNode` union type
2. Update `computePositions()` to handle the new node type
3. Update `computeDividers()` if the new type needs resize handles
4. Update `getLeafPaneIds()` for leaf enumeration

## Code Style

- **Rust**: Standard `rustfmt` formatting. The CI enforces `cargo fmt --check`.
- **TypeScript**: No explicit formatter configured. Follow existing patterns: named exports, SolidJS reactive primitives (`createSignal`, `createStore`, `createMemo`).
- **CSS**: All styles in a single `App.css` file. Class names use BEM-like naming (e.g., `project-card-header`, `task-status-in-progress`).
- **No emojis** in code or documentation.

## Build Commands

| Command | Where | Purpose |
|---------|-------|---------|
| `pnpm tauri dev` | `app/` | Development mode with hot reload |
| `pnpm tauri build` | `app/` | Production build (creates .app bundle) |
| `pnpm build` | `app/` | Frontend-only Vite build |
| `cargo check --workspace` | repo root | Rust type checking |
| `cargo clippy --workspace` | repo root | Rust linting |
| `cargo fmt --check` | repo root | Rust format check |
| `npx tsc --noEmit` | `app/` | TypeScript type checking |

## CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on every push to `main` and on pull requests:

**test job** (ubuntu-latest):
1. Install system dependencies (webkit2gtk, appindicator, librsvg, patchelf)
2. `cargo check --workspace --all-targets`
3. `cargo test --workspace --all-targets`
4. `cargo clippy --workspace --all-targets -- -D warnings`
5. `pnpm install` + `npx tsc --noEmit` (frontend type checking)

**fmt job** (ubuntu-latest):
1. `cargo fmt --check`

Both jobs must pass for a PR to merge.

## Testing

There are currently no unit tests or integration tests in the codebase. The CI runs `cargo test` (which succeeds with zero tests) and `tsc --noEmit` for type safety.

To verify changes manually:
1. Run `pnpm tauri dev` from `app/`
2. Check Dashboard view loads with projects from `~/.ordis/config.toml`
3. Switch to Workspace, verify a terminal pane spawns with Claude Code
4. Test split/close pane operations
5. Test pane zoom (**Cmd+Shift+Enter**) -- zoomed pane fills workspace, unzoom restores layout
6. Test command palette (**Cmd+K**) -- opens, fuzzy search filters, Enter executes, Escape dismisses
7. If task features were changed, verify CRUD operations work against a project with `.limbo/` initialized
8. Test file viewing (**Cmd+O**) -- open a code file, markdown file, and image. Verify syntax highlighting, rendering, and zoom/pan.
9. Test file browser (**Cmd+E**) -- sidebar shows directory tree, clicking a file opens a viewer pane
10. Test Settings (**Cmd+,**) -- verify all 5 panels load. Test adding/removing a permission rule and saving.
11. Close and relaunch -- verify session layout (including viewer panes) is restored from `~/.ordis/session.json`

## Configuration

Ordis reads `~/.ordis/config.toml`:

```toml
default_cwd = "~/projects"

[[projects]]
name = "my-project"
path = "~/projects/my-project"

[[projects]]
name = "another-project"
path = "~/work/another-project"
```

Projects with a `.limbo/` directory in their path get task management features in the Dashboard.
