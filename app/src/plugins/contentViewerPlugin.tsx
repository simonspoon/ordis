import { createSignal, createEffect, Show, Switch, Match, onMount, onCleanup, lazy, untrack } from "solid-js";
import type { Component } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { registerSessionPlugin, showSessionOverlay, dismissSessionOverlay } from "../lib/plugins";
import { activePaneId, panes, setPanes } from "../lib/store";
import type { ViewerType } from "../lib/store";

const CodeViewer = lazy(() => import("../components/CodeViewer"));
const MarkdownViewer = lazy(() => import("../components/MarkdownViewer"));
const ImageViewer = lazy(() => import("../components/ImageViewer"));
const PdfViewer = lazy(() => import("../components/PdfViewer"));
const DiffViewer = lazy(() => import("../components/DiffViewer"));

interface FileContent {
  content: string;
  size: number;
  extension: string;
  viewerType: string;
}

// --- Internal state ---

const [currentFilePath, setCurrentFilePath] = createSignal<string | null>(null);
const [currentViewerType, setCurrentViewerType] = createSignal<ViewerType>("code");
const [fileData, setFileData] = createSignal<FileContent | null>(null);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
const [lineWrap, setLineWrap] = createSignal(false);

// --- Per-pane state persistence ---

interface ContentViewerPaneState {
  filePath: string | null;
  viewerType: ViewerType;
  lineWrap: boolean;
}

const PLUGIN_KEY = "content-viewer";

let previousPaneId: string | null = null;

function saveStateToPane(paneId: string): void {
  const pane = panes[paneId];
  if (!pane) return;
  const state: ContentViewerPaneState = {
    filePath: currentFilePath(),
    viewerType: currentViewerType(),
    lineWrap: lineWrap(),
  };
  setPanes(paneId, "pluginData", { ...pane.pluginData, [PLUGIN_KEY]: state });
}

function loadStateFromPane(paneId: string): void {
  const pane = panes[paneId];
  const saved = pane?.pluginData?.[PLUGIN_KEY] as ContentViewerPaneState | undefined;
  if (saved?.filePath) {
    setCurrentViewerType(saved.viewerType);
    setLineWrap(saved.lineWrap);
    setCurrentFilePath(saved.filePath);
  } else {
    setCurrentFilePath(null);
    setCurrentViewerType("code");
    setFileData(null);
    setError(null);
    setLoading(false);
    setLineWrap(false);
  }
}

function clearStateFromPane(paneId: string): void {
  const pane = panes[paneId];
  if (!pane) return;
  const updated = { ...pane.pluginData };
  delete updated[PLUGIN_KEY];
  setPanes(paneId, "pluginData", updated);
}

// --- Exported API ---

export function openInViewer(filePath: string, viewerType?: string) {
  const paneId = activePaneId();
  setCurrentFilePath(filePath);
  if (viewerType) {
    setCurrentViewerType(viewerType as ViewerType);
    if (paneId) saveStateToPane(paneId);
  } else {
    invoke<string>("detect_file_type", { path: filePath })
      .then((detected) => {
        setCurrentViewerType(detected as ViewerType);
        if (paneId) saveStateToPane(paneId);
      })
      .catch(() => {
        setCurrentViewerType("code");
        if (paneId) saveStateToPane(paneId);
      });
  }
  showSessionOverlay("content-viewer");
}

// --- Helpers ---

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

function fileName(path: string): string {
  return path.substring(path.lastIndexOf("/") + 1) || "File";
}

// --- Component ---

const ContentViewer: Component<{ visible: boolean }> = (props) => {
  // Swap state when active pane changes
  createEffect(() => {
    const newPaneId = activePaneId();
    if (newPaneId === previousPaneId) return;
    // Save current state to the old pane
    if (previousPaneId) {
      untrack(() => saveStateToPane(previousPaneId!));
    }
    previousPaneId = newPaneId;
    if (!newPaneId) return;
    // Load state from the new pane
    untrack(() => loadStateFromPane(newPaneId));
  });

  // Load file content when currentFilePath changes
  createEffect(() => {
    const path = currentFilePath();
    if (!path) {
      setFileData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setFileData(null);

    invoke<FileContent>("read_file", { path })
      .then((data) => {
        setFileData(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  });

  // Clear state when overlay is dismissed externally
  createEffect(() => {
    if (!props.visible && currentFilePath() !== null) {
      const paneId = activePaneId();
      setCurrentFilePath(null);
      setFileData(null);
      setError(null);
      setLoading(false);
      setLineWrap(false);
      if (paneId) clearStateFromPane(paneId);
    }
  });

  // Escape key dismisses overlay
  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && currentFilePath()) {
        e.preventDefault();
        e.stopPropagation();
        dismissSessionOverlay();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, true));
  });

  return (
    <Show when={props.visible && currentFilePath()}>
      <div class="viewer-wrapper viewer-focused">
        <div class="viewer-toolbar">
          <span class="viewer-filename" title={currentFilePath()!}>
            {fileName(currentFilePath()!)}
          </span>
          <span class="viewer-meta" title={currentFilePath()!}>
            {shortenPath(currentFilePath()!)}
          </span>
          <Show when={fileData()}>
            <span class="viewer-meta">
              {formatSize(fileData()!.size)}
            </span>
          </Show>
          <div class="viewer-actions">
            <Show when={currentViewerType() === "code"}>
              <button
                class={`viewer-action ${lineWrap() ? "viewer-action-active" : ""}`}
                onClick={() => setLineWrap((v) => !v)}
                title="Toggle word wrap"
              >
                wrap
              </button>
            </Show>
            <button
              class="viewer-action"
              onClick={() => dismissSessionOverlay()}
              title="Close viewer"
            >
              &times;
            </button>
          </div>
        </div>
        <div class="viewer-content">
          <Show when={loading()}>
            <div class="viewer-loading">Loading...</div>
          </Show>
          <Show when={error()}>
            <div class="viewer-error">{error()}</div>
          </Show>
          <Show when={fileData() && !loading()}>
            <Switch fallback={<div class="viewer-error">Unknown viewer type: {currentViewerType()}</div>}>
              <Match when={currentViewerType() === "code"}>
                <CodeViewer
                  content={fileData()!.content}
                  extension={fileData()!.extension}
                  lineWrap={lineWrap()}
                />
              </Match>
              <Match when={currentViewerType() === "markdown"}>
                <MarkdownViewer content={fileData()!.content} />
              </Match>
              <Match when={currentViewerType() === "image"}>
                <ImageViewer
                  content={fileData()!.content}
                  filePath={currentFilePath()!}
                />
              </Match>
              <Match when={currentViewerType() === "pdf"}>
                <PdfViewer content={fileData()!.content} />
              </Match>
              <Match when={currentViewerType() === "diff"}>
                <DiffViewer content={fileData()!.content} />
              </Match>
            </Switch>
          </Show>
        </div>
      </div>
    </Show>
  );
};

export function init() {
  registerSessionPlugin(
    { id: "content-viewer", name: "Content Viewer", icon: "\u{1F4C4}", type: "overlay" },
    ContentViewer,
  );
}
