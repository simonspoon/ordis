import { onMount, onCleanup, createSignal, Show } from "solid-js";
import { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { spawn } from "tauri-pty";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { panes, setPaneCwd, closePane, createPane, activePaneId, setActivePaneId } from "../lib/store";
import { toast } from "../lib/toast";
import { createSessionEventBus } from "../lib/sessionEventBus";
import { addArtifact } from "../lib/artifacts";
import "@xterm/xterm/css/xterm.css";

interface GitInfo {
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
}

interface Props {
  paneId: string;
}

export default function TerminalPane(props: Props) {
  let containerRef!: HTMLDivElement;
  let searchInputRef!: HTMLInputElement;
  let term: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let searchAddon: SearchAddon | null = null;
  let pty: ReturnType<typeof spawn> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let bus: ReturnType<typeof createSessionEventBus> | null = null;

  const [gitInfo, setGitInfo] = createSignal<GitInfo | null>(null);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [agentDropdownOpen, setAgentDropdownOpen] = createSignal(false);
  const [availableAgents, setAvailableAgents] = createSignal<string[]>([]);

  const paneCwd = () => panes[props.paneId]?.cwd || "";

  const fetchGitInfo = async () => {
    const cwd = paneCwd();
    if (!cwd) { setGitInfo(null); return; }
    try {
      const info = await invoke<GitInfo | null>("get_git_info", { path: cwd });
      setGitInfo(info);
    } catch {
      setGitInfo(null);
    }
  };

  const currentAgent = () => panes[props.paneId]?.agent || "default";

  const agentLabel = (agent: string) => {
    if (agent === "default" || !agent) return "default";
    // Strip plugin prefix for display (e.g., "swe-team:project-manager" -> "project-manager")
    const parts = agent.split(":");
    return parts[parts.length - 1];
  };

  const toggleAgentDropdown = async () => {
    if (!agentDropdownOpen()) {
      try {
        const agents = await invoke<string[]>("list_agents");
        setAvailableAgents(agents);
      } catch {
        setAvailableAgents([]);
      }
    }
    setAgentDropdownOpen((v) => !v);
  };

  const selectAgent = (agent: string) => {
    setAgentDropdownOpen(false);
    const newAgent = agent === "default" ? undefined : agent;
    const currentPaneAgent = panes[props.paneId]?.agent;
    if (newAgent === currentPaneAgent) return;
    // Changing agent requires restarting — close old pane, create new one
    const cwd = paneCwd();
    closePane(props.paneId);
    setTimeout(() => createPane(cwd, { agent: newAgent }), 50);
  };

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => {
      if (searchInputRef) {
        searchInputRef.focus();
        searchInputRef.select();
      }
    });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    searchAddon?.clearDecorations();
  };

  const doSearch = (query: string, direction: "next" | "prev" = "next") => {
    if (!searchAddon || !query) {
      searchAddon?.clearDecorations();
      return;
    }
    if (direction === "next") {
      searchAddon.findNext(query, { decorations: { matchOverviewRuler: "#7c5cbf", activeMatchColorOverviewRuler: "#e0a84e" } });
    } else {
      searchAddon.findPrevious(query, { decorations: { matchOverviewRuler: "#7c5cbf", activeMatchColorOverviewRuler: "#e0a84e" } });
    }
  };

  const changeFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: paneCwd() || undefined,
      title: "Choose working directory",
    });
    if (selected && pty) {
      setPaneCwd(props.paneId, selected);
      pty.write(`cd ${shellEscape(selected)}\n`);
    }
  };

  onMount(() => {
    term = new Terminal({
      fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 14,
      lineHeight: 1.3,
      theme: {
        background: "#1a1a2e",
        foreground: "#e0e0e0",
        cursor: "#7c5cbf",
        cursorAccent: "#1a1a2e",
        selectionBackground: "rgba(124, 92, 191, 0.3)",
        black: "#1a1a2e",
        red: "#e55555",
        green: "#4ec9b0",
        yellow: "#e0a84e",
        blue: "#569cd6",
        magenta: "#c586c0",
        cyan: "#56b6c2",
        white: "#e0e0e0",
        brightBlack: "#606070",
        brightRed: "#ff6b6b",
        brightGreen: "#6ee7b7",
        brightYellow: "#fbbf24",
        brightBlue: "#7cb3f0",
        brightMagenta: "#d19fd6",
        brightCyan: "#7ee0e0",
        brightWhite: "#ffffff",
      },
      convertEol: true,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
    });

    fitAddon = new FitAddon();
    searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.open(containerRef);

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      toast.warning("WebGL unavailable — using fallback renderer (may be slower)");
    }

    fitAddon.fit();

    const currentCwd = paneCwd() || undefined;
    const pane = panes[props.paneId];
    let command = "claude --dangerously-skip-permissions";
    if (pane?.agent) {
      command += ` --agent ${shellEscape(pane.agent)}`;
    }
    if (pane?.effort) {
      command += ` --effort ${shellEscape(pane.effort)}`;
    }
    if (pane?.prompt) {
      command += ` ${shellEscape(pane.prompt)}`;
    }

    try {
      pty = spawn("/bin/zsh", ["-l", "-c", command], {
        cols: term.cols,
        rows: term.rows,
        cwd: currentCwd,
        name: "xterm-256color",
        env: {
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      });
    } catch (e) {
      toast.error(`Failed to spawn terminal: ${e}`);
      term.write(`\r\n\x1b[31mFailed to spawn terminal: ${e}\x1b[0m\r\n`);
      return;
    }

    // Pending snapshots: when a Read is detected, snapshot the file immediately
    // so the pre-edit content is captured BEFORE any subsequent edit lands on disk.
    const pendingSnapshots = new Map<string, string>();
    const SNAPSHOT_TTL_MS = 60_000;
    const snapshotTimers = new Map<string, ReturnType<typeof setTimeout>>();

    bus = createSessionEventBus();

    pty.onData((data: Uint8Array) => {
      term!.write(new Uint8Array(data));
      bus!.feed(data);
    });

    bus.on("file_read", (e) => {
      // Snapshot immediately — Claude reads before editing
      invoke<{ content: string }>("snapshot_file", { path: e.path })
        .then((snap) => {
          pendingSnapshots.set(e.path, snap.content);
          if (snapshotTimers.has(e.path)) clearTimeout(snapshotTimers.get(e.path));
          snapshotTimers.set(e.path, setTimeout(() => {
            pendingSnapshots.delete(e.path);
            snapshotTimers.delete(e.path);
          }, SNAPSHOT_TTL_MS));
        })
        .catch(() => { /* file may not exist yet */ });

      // Also add as artifact (old code added reads unconditionally)
      const ext = e.path.split(".").pop() || "";
      addArtifact({
        filePath: e.path,
        fileName: e.path.split("/").pop() || e.path,
        operation: "read",
        viewerType: mapExtToViewer(ext),
      });
    });

    bus.on("file_written", (e) => {
      const ext = e.path.split(".").pop() || "";
      const viewerType = mapExtToViewer(ext);
      const preEditContent = (e.operation === "edited")
        ? pendingSnapshots.get(e.path)
        : undefined;

      addArtifact({
        filePath: e.path,
        fileName: e.path.split("/").pop() || e.path,
        operation: e.operation,
        viewerType,
        preEditContent,
      });

      // Clean up used snapshot
      if (e.operation === "edited" && pendingSnapshots.has(e.path)) {
        if (snapshotTimers.has(e.path)) clearTimeout(snapshotTimers.get(e.path));
        pendingSnapshots.delete(e.path);
        snapshotTimers.delete(e.path);
      }
    });

    term.onData((data: string) => {
      pty!.write(data);
    });

    term.onResize(({ cols, rows }) => {
      pty!.resize(cols, rows);
    });

    pty.onExit(() => {
      closePane(props.paneId);
    });

    resizeObserver = new ResizeObserver(() => {
      if (fitAddon) fitAddon.fit();
    });
    resizeObserver.observe(containerRef);

    // Poll git info every 5 seconds
    fetchGitInfo();
    const gitPollInterval = setInterval(fetchGitInfo, 5000);
    onCleanup(() => clearInterval(gitPollInterval));

    // Cmd+F search handler (scoped to this pane when focused)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "f" && activePaneId() === props.paneId) {
        e.preventDefault();
        e.stopPropagation();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, true));

    // Close agent dropdown on outside click
    const onDocClick = (e: MouseEvent) => {
      if (agentDropdownOpen()) {
        const target = e.target as HTMLElement;
        if (!target.closest(".pane-agent-selector")) {
          setAgentDropdownOpen(false);
        }
      }
    };
    document.addEventListener("click", onDocClick);
    onCleanup(() => document.removeEventListener("click", onDocClick));
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    bus?.destroy();
    if (pty) {
      try { pty.kill(); } catch { /* already dead */ }
    }
    term?.dispose();
  });

  return (
    <div
      class={`terminal-wrapper ${activePaneId() === props.paneId ? "terminal-focused" : ""}`}
      onMouseDown={() => setActivePaneId(props.paneId)}
    >
      <div class="pane-toolbar">
        <button class="pane-cwd" onClick={changeFolder} title={paneCwd()}>
          {paneCwd() ? paneCwd().replace(/^\/Users\/[^/]+/, "~") : "..."}
        </button>
        {gitInfo() && (
          <span class="pane-git-info">
            <span class="pane-git-branch">{gitInfo()!.branch}</span>
            {gitInfo()!.dirty && <span class="pane-git-dirty">*</span>}
            {gitInfo()!.ahead > 0 && <span class="pane-git-ahead">+{gitInfo()!.ahead}</span>}
            {gitInfo()!.behind > 0 && <span class="pane-git-behind">-{gitInfo()!.behind}</span>}
          </span>
        )}
        <div class="pane-agent-selector" style={{ "margin-left": "auto" }}>
          <button class="pane-agent-btn" onClick={toggleAgentDropdown} title="Change agent">
            {agentLabel(currentAgent())}
          </button>
          <Show when={agentDropdownOpen()}>
            <div class="pane-agent-dropdown">
              <div
                class={`pane-agent-option ${currentAgent() === "default" ? "pane-agent-option-active" : ""}`}
                onClick={() => selectAgent("default")}
              >
                default
              </div>
              {availableAgents().map((agent) => (
                <div
                  class={`pane-agent-option ${currentAgent() === agent ? "pane-agent-option-active" : ""}`}
                  onClick={() => selectAgent(agent)}
                >
                  {agentLabel(agent)}
                  <Show when={agent.includes(":")}>
                    <span class="pane-agent-plugin">{agent.split(":")[0]}</span>
                  </Show>
                </div>
              ))}
            </div>
          </Show>
        </div>
      </div>
      <Show when={searchOpen()}>
        <div class="pane-search-bar">
          <input
            ref={searchInputRef}
            class="pane-search-input"
            type="text"
            placeholder="Search..."
            value={searchQuery()}
            onInput={(e) => {
              const q = e.currentTarget.value;
              setSearchQuery(q);
              doSearch(q);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                doSearch(searchQuery(), "prev");
              } else if (e.key === "Enter") {
                e.preventDefault();
                doSearch(searchQuery(), "next");
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeSearch();
              }
            }}
          />
          <button class="pane-search-nav" onClick={() => doSearch(searchQuery(), "prev")} title="Previous (Shift+Enter)">&#x25B2;</button>
          <button class="pane-search-nav" onClick={() => doSearch(searchQuery(), "next")} title="Next (Enter)">&#x25BC;</button>
          <button class="pane-search-close" onClick={closeSearch}>&times;</button>
        </div>
      </Show>
      <div ref={containerRef} class="terminal-pane" />
    </div>
  );
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function mapExtToViewer(ext: string): string {
  switch (ext.toLowerCase()) {
    case "md": case "mdx": case "markdown": return "markdown";
    case "png": case "jpg": case "jpeg": case "gif": case "bmp": case "svg": case "webp": case "ico": case "avif": return "image";
    case "pdf": return "pdf";
    case "diff": case "patch": return "diff";
    default: return "code";
  }
}
