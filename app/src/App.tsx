import { onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  panes, paneOrder,
  createPane, activePaneId,
} from "./lib/store";
import PaneBar from "./components/PaneBar";
import TerminalPane from "./components/TerminalPane";
import "./App.css";

export default function App() {
  onMount(async () => {
    const currentCwd = await invoke<string>("get_cwd");
    createPane(currentCwd);
  });

  return (
    <div class="app">
      <div class="titlebar">
        <span class="titlebar-title">Ordis</span>
      </div>
      <PaneBar />
      <div class="terminal-container">
        <Show when={paneOrder().length > 0} fallback={<div class="empty-state">No panes open</div>}>
          <For each={paneOrder()}>
            {(id) => (
              <Show when={panes[id]}>
                <TerminalPane paneId={id} visible={activePaneId() === id} />
              </Show>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
