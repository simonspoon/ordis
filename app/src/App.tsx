import { onMount, onCleanup, For, Show, createMemo, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  panes, layout, activePaneId, setActivePaneId,
  createPane, splitPane, closePane,
  getLeafPaneIds, computePositions, computeDividers,
} from "./lib/store";
import { viewMode, setViewMode } from "./lib/tasks";
import PaneBar from "./components/PaneBar";
import TerminalPane from "./components/TerminalPane";
import SplitDivider from "./components/SplitDivider";
import Dashboard from "./components/Dashboard";
import TaskSidebar from "./components/TaskSidebar";
import "./App.css";

export default function App() {
  const [sidebarVisible, setSidebarVisible] = createSignal(false);

  // Keyboard shortcuts
  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey) return;

      // View mode: Cmd+1 = Dashboard, Cmd+2 = Workspace
      if (e.key === "1" && !e.shiftKey && viewMode() !== "dashboard") {
        e.preventDefault();
        setViewMode("dashboard");
        return;
      }
      if (e.key === "2" && !e.shiftKey && viewMode() !== "workspace") {
        e.preventDefault();
        switchToWorkspace();
        return;
      }

      // Sidebar toggle: Cmd+B
      if (e.key === "b" && !e.shiftKey) {
        e.preventDefault();
        setSidebarVisible((v) => !v);
        return;
      }

      // Workspace-only shortcuts
      if (viewMode() !== "workspace") return;

      if (e.key === "d" && !e.shiftKey) {
        e.preventDefault();
        splitPane("vertical");
      } else if (e.key === "d" && e.shiftKey) {
        e.preventDefault();
        splitPane("horizontal");
      } else if (e.key === "w") {
        e.preventDefault();
        const active = activePaneId();
        if (active && getLeafPaneIds().length > 1) closePane(active);
      } else if (e.key >= "3" && e.key <= "9") {
        e.preventDefault();
        const ids = getLeafPaneIds();
        const idx = parseInt(e.key) - 3;
        if (idx < ids.length) setActivePaneId(ids[idx]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  const switchToWorkspace = async () => {
    setViewMode("workspace");
    if (getLeafPaneIds().length === 0) {
      const cwd = await invoke<string>("get_cwd");
      createPane(cwd);
    }
  };

  const positions = createMemo(() => computePositions(layout()));
  const dividers = createMemo(() => computeDividers(layout()));
  const leafIds = createMemo(() => getLeafPaneIds());

  return (
    <div class="app">
      <div class="titlebar">
        <span class="titlebar-title">Ordis</span>
        <div class="titlebar-tabs">
          <button
            class={`titlebar-tab ${viewMode() === "dashboard" ? "titlebar-tab-active" : ""}`}
            onClick={() => setViewMode("dashboard")}
          >
            Dashboard
          </button>
          <button
            class={`titlebar-tab ${viewMode() === "workspace" ? "titlebar-tab-active" : ""}`}
            onClick={switchToWorkspace}
          >
            Workspace
          </button>
        </div>
      </div>

      <Show when={viewMode() === "dashboard"}>
        <Dashboard />
      </Show>

      <Show when={viewMode() === "workspace"}>
        <PaneBar />
        <div class="workspace-layout">
          <TaskSidebar visible={sidebarVisible()} />
          <div class="terminal-container">
            <Show
              when={leafIds().length > 0}
              fallback={
                <div class="empty-state">
                  <span>No sessions</span>
                  <button
                    class="empty-state-btn"
                    onClick={async () => {
                      const cwd = await invoke<string>("get_cwd");
                      createPane(cwd);
                    }}
                  >
                    New Session
                  </button>
                </div>
              }
            >
              <For each={leafIds()}>
                {(id) => {
                  const pos = () => positions()[id];
                  return (
                    <Show when={panes[id] && pos()}>
                      <div
                        class="pane-position"
                        style={{
                          left: `${pos()!.x * 100}%`,
                          top: `${pos()!.y * 100}%`,
                          width: `${pos()!.w * 100}%`,
                          height: `${pos()!.h * 100}%`,
                        }}
                      >
                        <TerminalPane paneId={id} />
                      </div>
                    </Show>
                  );
                }}
              </For>
              <For each={dividers()}>
                {(info) => <SplitDivider info={info} />}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
