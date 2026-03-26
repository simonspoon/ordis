import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";

export interface PaneState {
  id: string;
  cwd: string;
}

// Pane state
export const [panes, setPanes] = createStore<Record<string, PaneState>>({});
export const [activePaneId, setActivePaneId] = createSignal<string>("");
export const [paneOrder, setPaneOrder] = createSignal<string[]>([]);

export function createPane(cwd: string): string {
  const id = crypto.randomUUID();
  setPanes(id, { id, cwd });
  setPaneOrder((prev) => [...prev, id]);
  setActivePaneId(id);
  return id;
}

export function setPaneCwd(paneId: string, cwd: string) {
  setPanes(paneId, "cwd", cwd);
}

export function closePane(paneId: string) {
  setPanes(produce((p) => { delete p[paneId]; }));
  setPaneOrder((prev) => prev.filter((id) => id !== paneId));
  if (activePaneId() === paneId) {
    const remaining = paneOrder();
    setActivePaneId(remaining.length > 0 ? remaining[0] : "");
  }
}
