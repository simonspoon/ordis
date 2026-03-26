import { onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { startListening, stopListening } from "./lib/events";
import { resetSession, skipPermissions, setSkipPermissions } from "./lib/store";
import ChatView from "./components/ChatView";
import InputArea from "./components/InputArea";
import StatusBar from "./components/StatusBar";
import "./App.css";

export default function App() {
  onMount(async () => {
    await startListening();
    const current = await invoke<boolean>("get_skip_permissions");
    setSkipPermissions(current);
  });

  onCleanup(() => {
    stopListening();
  });

  const handleNewSession = async () => {
    await invoke("new_session");
    resetSession();
  };

  const toggleSkipPermissions = async () => {
    const next = !skipPermissions();
    await invoke("set_skip_permissions", { enabled: next });
    setSkipPermissions(next);
  };

  return (
    <div class="app">
      <div class="titlebar">
        <span class="titlebar-title">Ordis</span>
        <div class="titlebar-actions">
          <button
            class={`btn btn-toggle ${skipPermissions() ? "btn-toggle-active" : ""}`}
            onClick={toggleSkipPermissions}
            title="Skip permission prompts (--dangerously-skip-permissions)"
          >
            Skip Permissions
          </button>
          <button class="btn btn-new" onClick={handleNewSession}>
            New Session
          </button>
        </div>
      </div>
      <ChatView />
      <InputArea />
      <StatusBar />
    </div>
  );
}
