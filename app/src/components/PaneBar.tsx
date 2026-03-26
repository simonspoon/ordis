import { For, Show } from "solid-js";
import { paneOrder, activePaneId, setActivePaneId, createPane, closePane } from "../lib/store";

export default function PaneBar() {
  return (
    <div class="pane-bar">
      <div class="pane-tabs">
        <For each={paneOrder()}>
          {(id, index) => {
            const isActive = () => activePaneId() === id;
            return (
              <button
                class={`pane-tab ${isActive() ? "pane-tab-active" : ""}`}
                onClick={() => setActivePaneId(id)}
              >
                <span class="pane-tab-label">Terminal {index() + 1}</span>
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
