import { onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  cwd, setCwd,
  panes, paneOrder,
  createPane, activePaneId,
} from "./lib/store";
import PaneBar from "./components/PaneBar";
import TerminalPane from "./components/TerminalPane";
import "./App.css";

export default function App() {
  onMount(async () => {
    const currentCwd = await invoke<string>("get_cwd");
    setCwd(currentCwd);
    createPane();
  });

  const changeFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: cwd() || undefined,
      title: "Choose working directory",
    });
    if (selected) {
      await invoke("set_cwd", { cwd: selected });
      setCwd(selected);
    }
  };

  return (
    <div class="app">
      <div class="titlebar">
        <span class="titlebar-title">Ordis</span>
        <button class="titlebar-cwd" onClick={changeFolder} title={cwd()}>
          {cwd() ? cwd().replace(/^\/Users\/[^/]+/, "~") : "..."}
        </button>
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
