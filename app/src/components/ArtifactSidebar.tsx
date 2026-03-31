import { For, Show, createMemo } from "solid-js";
import {
  getArtifacts,
  type ArtifactEntry,
  type ArtifactOperation,
} from "../lib/artifacts";

interface Props {
  visible: boolean;
  onSelect: (artifact: ArtifactEntry) => void;
}

export default function ArtifactSidebar(props: Props) {
  const artifacts = createMemo(() => getArtifacts());

  return (
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
                onClick={() => props.onSelect(artifact)}
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
  );
}

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
  // Handle macOS (/Users/<name>) and Linux (/home/<name>) home directories
  return path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}
