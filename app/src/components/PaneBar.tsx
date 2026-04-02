import { For, Show, createSignal } from "solid-js";
import {
  panes, activePaneId, setActivePaneId,
  closePane, splitPane, getLeafPaneIds,
  isZoomed, toggleZoom, swapPanes,
  getTabs, getActiveTabId, createTab, switchTab, closeTab, renameTab,
} from "../lib/store";
import type { ViewerType } from "../lib/store";

const viewerTypeLabels: Record<ViewerType, string> = {
  code: "CODE",
  markdown: "MD",
  image: "IMG",
  pdf: "PDF",
  diff: "DIFF",
};

export default function PaneBar() {
  const leafIds = () => getLeafPaneIds();
  const [dragOverId, setDragOverId] = createSignal<string | null>(null);
  const [dragSourceId, setDragSourceId] = createSignal<string | null>(null);

  const label = (id: string) => {
    const pane = panes[id];
    if (!pane) return "Terminal";
    if (pane.paneType === "viewer") {
      return pane.fileLabel || pane.filePath?.split("/").pop() || "Viewer";
    }
    const cwd = pane.cwd;
    if (!cwd) return "Terminal";
    const parts = cwd.split("/");
    return parts[parts.length - 1] || "Terminal";
  };

  const typeIndicator = (id: string) => {
    const pane = panes[id];
    if (!pane || pane.paneType !== "viewer") return null;
    return viewerTypeLabels[pane.viewerType || "code"];
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

  const handleNewTab = () => {
    const cwd = panes[activePaneId()]?.cwd || "";
    const name = cwd.split("/").pop() || "New Tab";
    createTab(name, cwd);
  };

  const handleRenameTab = (tabId: string, currentName: string) => {
    const newName = window.prompt("Rename tab:", currentName);
    if (newName?.trim()) renameTab(tabId, newName.trim());
  };

  return (
    <>
      <div class="workspace-tabs">
        <For each={getTabs()}>
          {(tab) => (
            <button
              class={`workspace-tab ${getActiveTabId() === tab.id ? "workspace-tab-active" : ""}`}
              onClick={() => switchTab(tab.id)}
              onDblClick={() => handleRenameTab(tab.id, tab.name)}
            >
              <span>{tab.name}</span>
              <Show when={getTabs().length > 1}>
                <span
                  class="workspace-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  ×
                </span>
              </Show>
            </button>
          )}
        </For>
        <button class="workspace-tab-add" onClick={handleNewTab} title="New Tab (Cmd+T)">
          +
        </button>
      </div>
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
                    <Show when={typeIndicator(id)}>
                    <span class="pane-tab-type">{typeIndicator(id)}</span>
                  </Show>
                  <span class="pane-tab-label">{label(id)}</span>
                  <Show when={leafIds().length > 1 || panes[id]?.paneType === "viewer"}>
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
    </>
  );
}
