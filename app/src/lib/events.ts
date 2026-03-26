import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeEvent } from "./types";
import { handleClaudeEvent } from "./store";

let unlisten: UnlistenFn | null = null;

export async function startListening() {
  if (unlisten) return;
  unlisten = await listen<ClaudeEvent>("claude-event", (event) => {
    handleClaudeEvent(event.payload);
  });
}

export function stopListening() {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
}
