import { Show, createSignal, createEffect, Switch, Match, lazy } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { panes, activePaneId, setActivePaneId } from "../lib/store";
import type { ViewerType } from "../lib/store";

const CodeViewer = lazy(() => import("./CodeViewer"));
const MarkdownViewer = lazy(() => import("./MarkdownViewer"));
const ImageViewer = lazy(() => import("./ImageViewer"));
const PdfViewer = lazy(() => import("./PdfViewer"));
const DiffViewer = lazy(() => import("./DiffViewer"));

interface FileContent {
  content: string;
  size: number;
  extension: string;
  viewerType: string;
}

interface Props {
  paneId: string;
}

export default function ViewerPane(props: Props) {
  const pane = () => panes[props.paneId];
  const filePath = () => pane()?.filePath || "";
  const viewerType = () => (pane()?.viewerType || "code") as ViewerType;
  const fileName = () => pane()?.fileLabel || filePath().split("/").pop() || "File";

  // Track file content with manual signal for robustness.
  // createResource with a source signal can skip fetch when source is falsy.
  const [fileData, setFileData] = createSignal<FileContent | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    const path = filePath();
    if (!path) {
      setLoading(false);
      setError("No file path");
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

  const [lineWrap, setLineWrap] = createSignal(false);

  return (
    <div
      class={`viewer-wrapper ${activePaneId() === props.paneId ? "viewer-focused" : ""}`}
      onMouseDown={() => setActivePaneId(props.paneId)}
    >
      <div class="viewer-toolbar">
        <span class="viewer-filename" title={filePath()}>
          {fileName()}
        </span>
        <Show when={fileData()}>
          <span class="viewer-meta">
            {formatSize(fileData()!.size)}
          </span>
        </Show>
        <div class="viewer-actions">
          <Show when={viewerType() === "code"}>
            <button
              class={`viewer-action ${lineWrap() ? "viewer-action-active" : ""}`}
              onClick={() => setLineWrap((v) => !v)}
              title="Toggle word wrap"
            >
              wrap
            </button>
          </Show>
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
          <Switch fallback={<div class="viewer-error">Unknown viewer type: {viewerType()}</div>}>
            <Match when={viewerType() === "code"}>
              <CodeViewer
                content={fileData()!.content}
                extension={fileData()!.extension}
                lineWrap={lineWrap()}
              />
            </Match>
            <Match when={viewerType() === "markdown"}>
              <MarkdownViewer content={fileData()!.content} />
            </Match>
            <Match when={viewerType() === "image"}>
              <ImageViewer
                content={fileData()!.content}
                filePath={filePath()}
              />
            </Match>
            <Match when={viewerType() === "pdf"}>
              <PdfViewer content={fileData()!.content} />
            </Match>
            <Match when={viewerType() === "diff"}>
              <DiffViewer content={fileData()!.content} />
            </Match>
          </Switch>
        </Show>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
