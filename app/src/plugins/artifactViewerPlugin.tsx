import { createSignal, createEffect, createMemo, For, Show, Switch, Match, onMount, onCleanup, lazy } from "solid-js";
import type { Component } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  getArtifacts,
  getPreEditContent,
  type ArtifactEntry,
  type ArtifactOperation,
} from "../lib/artifacts";
import { registerSessionPlugin } from "../lib/plugins";

const CodeViewer = lazy(() => import("../components/CodeViewer"));
const MarkdownViewer = lazy(() => import("../components/MarkdownViewer"));
const ImageViewer = lazy(() => import("../components/ImageViewer"));
const DiffViewer = lazy(() => import("../components/DiffViewer"));

interface FileContent {
  content: string;
  size: number;
  extension: string;
  viewerType: string;
}

// --- Helpers ---

function operationIcon(op: ArtifactOperation): string {
  switch (op) {
    case "created": return "\u2795";   // heavy plus sign
    case "edited": return "\u270E";    // pencil
    case "read": return "\u2630";      // trigram for heaven (eye-like)
    case "screenshot": return "\u2B1A"; // white large square
    default: return "\u2022";           // bullet
  }
}

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

// --- Component ---

const ArtifactViewer: Component<{ visible: boolean }> = (props) => {
  const [popoverArtifact, setPopoverArtifact] = createSignal<ArtifactEntry | null>(null);
  const [fileData, setFileData] = createSignal<FileContent | null>(null);
  const [diffContent, setDiffContent] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showDiff, setShowDiff] = createSignal(false);

  const artifacts = createMemo(() => getArtifacts());

  // Load file content when popover artifact changes
  createEffect(() => {
    const art = popoverArtifact();
    if (!art) {
      setFileData(null);
      setDiffContent(null);
      setError(null);
      setShowDiff(false);
      return;
    }

    setLoading(true);
    setError(null);
    setFileData(null);
    setDiffContent(null);
    setShowDiff(false);

    invoke<FileContent>("read_file", { path: art.filePath })
      .then((data) => {
        setFileData(data);
        setLoading(false);

        // If this is an edited file with preEditContent, compute diff
        const preEdit = art.hasPreEditContent ? getPreEditContent(art.id) : undefined;
        if (art.operation === "edited" && preEdit) {
          invoke<string>("compute_diff", {
            oldContent: preEdit,
            newContent: data.content,
            filePath: art.fileName,
          })
            .then((diff) => setDiffContent(diff))
            .catch(() => { /* diff is optional enhancement */ });
        }
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  });

  // Escape key dismisses popover
  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && popoverArtifact()) {
        e.preventDefault();
        e.stopPropagation();
        setPopoverArtifact(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, true));
  });

  const handleBackdropClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("artifact-popover-backdrop")) {
      setPopoverArtifact(null);
    }
  };

  const hasDiff = () => !!diffContent();
  const viewerType = () => fileData()?.viewerType || popoverArtifact()?.viewerType || "code";

  return (
    <>
      {/* Sidebar */}
      <div class={`artifact-sidebar ${props.visible ? "" : "artifact-sidebar-hidden"}`}>
        <div class="sidebar-header">
          <span class="sidebar-title">Artifacts</span>
          <span class="artifact-count">{artifacts().length}</span>
        </div>
        <div class="sidebar-content">
          <Show
            when={artifacts().length > 0}
            fallback={
              <div class="sidebar-empty">No artifacts yet. Files touched by Claude will appear here.</div>
            }
          >
            <For each={artifacts()}>
              {(artifact) => (
                <div
                  class="artifact-item"
                  onClick={() => setPopoverArtifact(artifact)}
                  title={artifact.filePath}
                >
                  <span class="artifact-icon">{operationIcon(artifact.operation)}</span>
                  <div class="artifact-info">
                    <span class="artifact-filename">{artifact.fileName}</span>
                    <span class="artifact-path">{shortenPath(artifact.filePath)}</span>
                  </div>
                  <span class={`artifact-badge artifact-badge-${artifact.operation}`}>
                    {artifact.operation}
                  </span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>

      {/* Popover */}
      <Show when={popoverArtifact()}>
        <div class="artifact-popover-backdrop" onClick={handleBackdropClick}>
          <div class="artifact-popover">
            <div class="artifact-popover-header">
              <span class="artifact-popover-filename">
                {popoverArtifact()!.fileName}
              </span>
              <span class={`artifact-badge artifact-badge-${popoverArtifact()!.operation}`}>
                {popoverArtifact()!.operation}
              </span>
              <div class="artifact-popover-actions">
                <Show when={hasDiff()}>
                  <button
                    class={`artifact-popover-toggle ${showDiff() ? "artifact-popover-toggle-active" : ""}`}
                    onClick={() => setShowDiff((v) => !v)}
                  >
                    {showDiff() ? "Rendered" : "Diff"}
                  </button>
                </Show>
                <button class="artifact-popover-close" onClick={() => setPopoverArtifact(null)}>
                  &times;
                </button>
              </div>
            </div>
            <div class="artifact-popover-body">
              <Show when={loading()}>
                <div class="viewer-loading">Loading...</div>
              </Show>
              <Show when={error()}>
                <div class="viewer-error">{error()}</div>
              </Show>
              <Show when={fileData() && !loading()}>
                <Show
                  when={showDiff() && diffContent()}
                  fallback={
                    <Switch fallback={
                      <CodeViewer
                        content={fileData()!.content}
                        extension={fileData()!.extension}
                        lineWrap={false}
                      />
                    }>
                      <Match when={viewerType() === "markdown"}>
                        <MarkdownViewer content={fileData()!.content} />
                      </Match>
                      <Match when={viewerType() === "image"}>
                        <ImageViewer
                          content={fileData()!.content}
                          filePath={popoverArtifact()!.filePath}
                        />
                      </Match>
                      <Match when={viewerType() === "diff"}>
                        <DiffViewer content={fileData()!.content} />
                      </Match>
                    </Switch>
                  }
                >
                  <DiffViewer content={diffContent()!} />
                </Show>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
};

export function init() {
  registerSessionPlugin(
    { id: "artifact-viewer", name: "Artifacts", icon: "\u{1F4E6}", type: "sidebar", defaultSide: "right" },
    ArtifactViewer,
  );
}
