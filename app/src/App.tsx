import { onMount, onCleanup, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  panes, layout, activePaneId, setActivePaneId,
  createPane, splitPane, closePane,
  getLeafPaneIds, computePositions, computeDividers,
} from "./lib/store";
import PaneBar from "./components/PaneBar";
import TerminalPane from "./components/TerminalPane";
import SplitDivider from "./components/SplitDivider";
import "./App.css";

export default function App() {
  onMount(async () => {
    const currentCwd = await invoke<string>("get_cwd");
    createPane(currentCwd);
  });

  // Keyboard shortcuts
  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey) return;

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
      } else if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const ids = getLeafPaneIds();
        const idx = parseInt(e.key) - 1;
        if (idx < ids.length) setActivePaneId(ids[idx]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  const positions = createMemo(() => computePositions(layout()));
  const dividers = createMemo(() => computeDividers(layout()));
  const leafIds = createMemo(() => getLeafPaneIds());

  return (
    <div class="app">
      <div class="titlebar">
        <span class="titlebar-title">Ordis</span>
      </div>
      <PaneBar />
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
  );
}
