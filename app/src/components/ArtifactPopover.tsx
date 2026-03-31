import { Show, createSignal, createEffect, Switch, Match, onMount, onCleanup, lazy } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { type ArtifactEntry, getPreEditContent } from "../lib/artifacts";

const CodeViewer = lazy(() => import("./CodeViewer"));
const MarkdownViewer = lazy(() => import("./MarkdownViewer"));
const ImageViewer = lazy(() => import("./ImageViewer"));
const DiffViewer = lazy(() => import("./DiffViewer"));

interface FileContent {
  content: string;
  size: number;
  extension: string;
  viewerType: string;
}

interface Props {
  artifact: ArtifactEntry | null;
  onClose: () => void;
}

export default function ArtifactPopover(props: Props) {
  const [fileData, setFileData] = createSignal<FileContent | null>(null);
  const [diffContent, setDiffContent] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showDiff, setShowDiff] = createSignal(false);

  // Load file content when artifact changes
  createEffect(() => {
    const art = props.artifact;
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
      if (e.key === "Escape" && props.artifact) {
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, true));
  });

  const handleBackdropClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("artifact-popover-backdrop")) {
      props.onClose();
    }
  };

  const hasDiff = () => !!diffContent();
  const viewerType = () => fileData()?.viewerType || props.artifact?.viewerType || "code";

  return (
    <Show when={props.artifact}>
      <div class="artifact-popover-backdrop" onClick={handleBackdropClick}>
        <div class="artifact-popover">
          <div class="artifact-popover-header">
            <span class="artifact-popover-filename">
              {props.artifact!.fileName}
            </span>
            <span class={`artifact-badge artifact-badge-${props.artifact!.operation}`}>
              {props.artifact!.operation}
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
              <button class="artifact-popover-close" onClick={() => props.onClose()}>
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
                        filePath={props.artifact!.filePath}
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
  );
}
