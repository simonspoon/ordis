import { For, Show, createSignal } from "solid-js";
import {
  panes, activePaneId, setActivePaneId,
  closePane, splitPane, getLeafPaneIds,
  isZoomed, toggleZoom, swapPanes,
} from "../lib/store";

export default function PaneBar() {
  const leafIds = () => getLeafPaneIds();
  const [dragOverId, setDragOverId] = createSignal<string | null>(null);
  const [dragSourceId, setDragSourceId] = createSignal<string | null>(null);

  const label = (id: string) => {
    const cwd = panes[id]?.cwd;
    if (!cwd) return "Terminal";
    const parts = cwd.split("/");
    return parts[parts.length - 1] || "Terminal";
  };

  const onDragStart = (id: string, e: DragEvent) => {
    setDragSourceId(id);
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", id);
  };

  const onDragOver = (id: string, e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    if (id !== dragSourceId()) {
      setDragOverId(id);
    }
  };

  const onDragLeave = () => {
    setDragOverId(null);
  };

  const onDrop = (targetId: string, e: DragEvent) => {
    e.preventDefault();
    const sourceId = e.dataTransfer!.getData("text/plain");
    setDragOverId(null);
    setDragSourceId(null);
    if (sourceId && sourceId !== targetId) {
      swapPanes(sourceId, targetId);
    }
  };

  const onDragEnd = () => {
    setDragOverId(null);
    setDragSourceId(null);
  };

  return (
    <div class="pane-bar">
      <div class="pane-tabs">
        <For each={leafIds()}>
          {(id) => {
            const isActive = () => activePaneId() === id;
            const isDragOver = () => dragOverId() === id;
            const isDragSource = () => dragSourceId() === id;
            return (
              <button
                class={`pane-tab ${isActive() ? "pane-tab-active" : ""} ${isDragOver() ? "pane-tab-drop-target" : ""} ${isDragSource() ? "pane-tab-dragging" : ""}`}
                onClick={() => setActivePaneId(id)}
                draggable={true}
                onDragStart={(e) => onDragStart(id, e)}
                onDragOver={(e) => onDragOver(id, e)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(id, e)}
                onDragEnd={onDragEnd}
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
