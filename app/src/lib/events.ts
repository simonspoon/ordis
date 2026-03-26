import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PaneEvent } from "./types";
import { handleClaudeEvent } from "./store";

let unlisten: UnlistenFn | null = null;

export async function startListening() {
  if (unlisten) return;
  unlisten = await listen<PaneEvent>("claude-event", (event) => {
    const { pane_id, event: claudeEvent } = event.payload;
    handleClaudeEvent(pane_id, claudeEvent);
  });
}

export function stopListening() {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
}
