import { For, Show } from "solid-js";
import { panes, paneOrder, activePaneId, setActivePaneId, createPane, closePane } from "../lib/store";

export default function PaneBar() {
  return (
    <div class="pane-bar">
      <div class="pane-tabs">
        <For each={paneOrder()}>
          {(id) => {
            const pane = () => panes[id];
            const isActive = () => activePaneId() === id;
            const label = () => {
              const s = pane()?.sessionId;
              return s ? `Session ${s.slice(0, 6)}` : "New Session";
            };

            return (
              <button
                class={`pane-tab ${isActive() ? "pane-tab-active" : ""}`}
                onClick={() => setActivePaneId(id)}
              >
                <span class="pane-tab-label">{label()}</span>
                <Show when={paneOrder().length > 1}>
                  <span
                    class="pane-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closePane(id);
                    }}
                  >
                    x
                  </span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>
      <button class="pane-add" onClick={() => createPane()} title="New pane">
        +
      </button>
    </div>
  );
}
