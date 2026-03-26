import { onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { startListening, stopListening } from "./lib/events";
import {
  cwd, setCwd,
  createPane, resetPane, activePaneId,
} from "./lib/store";
import PaneBar from "./components/PaneBar";
import SessionPane from "./components/SessionPane";
import "./App.css";

export default function App() {
  onMount(async () => {
    await startListening();
    const currentCwd = await invoke<string>("get_cwd");
    setCwd(currentCwd);
    createPane();
  });

  onCleanup(() => {
    stopListening();
  });

  const handleNewSession = async () => {
    const paneId = activePaneId();
    if (!paneId) return;
    await invoke("new_session", { paneId });
    resetPane(paneId);
  };

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
      const paneId = activePaneId();
      if (paneId) {
        await invoke("new_session", { paneId });
        resetPane(paneId);
      }
    }
  };

  return (
    <div class="app">
      <div class="titlebar">
        <span class="titlebar-title">Ordis</span>
        <button class="titlebar-cwd" onClick={changeFolder} title={cwd()}>
          {cwd() ? cwd().replace(/^\/Users\/[^/]+/, "~") : "..."}
        </button>
        <div class="titlebar-actions">
          <button class="btn btn-new" onClick={handleNewSession}>
            New Session
          </button>
        </div>
      </div>
      <PaneBar />
      <Show when={activePaneId()} fallback={<div class="empty-state">No panes open</div>}>
        <SessionPane paneId={activePaneId()} />
      </Show>
    </div>
  );
}
