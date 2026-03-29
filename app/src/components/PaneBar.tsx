import { For, Show } from "solid-js";
import {
  panes, activePaneId, setActivePaneId,
  closePane, splitPane, getLeafPaneIds,
  isZoomed, toggleZoom,
} from "../lib/store";

export default function PaneBar() {
  const leafIds = () => getLeafPaneIds();

  const label = (id: string) => {
    const cwd = panes[id]?.cwd;
    if (!cwd) return "Terminal";
    const parts = cwd.split("/");
    return parts[parts.length - 1] || "Terminal";
  };

  return (
    <div class="pane-bar">
      <div class="pane-tabs">
        <For each={leafIds()}>
          {(id) => {
            const isActive = () => activePaneId() === id;
            return (
              <button
                class={`pane-tab ${isActive() ? "pane-tab-active" : ""}`}
                onClick={() => setActivePaneId(id)}
              >
                <span class="pane-tab-label">{label(id)}</span>
                <Show when={leafIds().length > 1}>
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
      <div class="pane-actions">
        <Show when={isZoomed()}>
          <button
            class="pane-action pane-zoom-indicator"
            onClick={toggleZoom}
            title="Unzoom (Cmd+Shift+Enter)"
          >
            ZOOMED
          </button>
        </Show>
        <button
          class="pane-action"
          onClick={() => splitPane("vertical")}
          title="Split vertical (Cmd+D)"
        >
          |
        </button>
        <button
          class="pane-action"
          onClick={() => splitPane("horizontal")}
          title="Split horizontal (Cmd+Shift+D)"
        >
          --
        </button>
      </div>
    </div>
  );
}
