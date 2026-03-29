import { createSignal, createMemo, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { panes, activePaneId, getLeafPaneIds } from "../lib/store";

interface GitInfo {
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
}

export default function StatusBar() {
  const [gitInfo, setGitInfo] = createSignal<GitInfo | null>(null);

  const paneCount = createMemo(() => getLeafPaneIds().length);

  const activeCwd = createMemo(() => {
    const id = activePaneId();
    return id ? panes[id]?.cwd || "" : "";
  });

  const projectName = createMemo(() => {
    const cwd = activeCwd();
    if (!cwd) return "";
    // Extract project folder name from path
    const parts = cwd.split("/");
    return parts[parts.length - 1] || "";
  });

  const fetchGitInfo = async () => {
    const cwd = activeCwd();
    if (!cwd) { setGitInfo(null); return; }
    try {
      const info = await invoke<GitInfo | null>("get_git_info", { path: cwd });
      setGitInfo(info);
    } catch {
      setGitInfo(null);
    }
  };

  onMount(() => {
    fetchGitInfo();
    const interval = setInterval(fetchGitInfo, 5000);
    onCleanup(() => clearInterval(interval));
  });

  // Re-fetch when active pane changes
  let lastActiveCwd = "";
  createMemo(() => {
    const cwd = activeCwd();
    if (cwd !== lastActiveCwd) {
      lastActiveCwd = cwd;
      fetchGitInfo();
    }
  });

  return (
    <div class="status-bar">
      <div class="status-bar-left">
        <span class="status-item status-pane-count" title="Active sessions">
          {paneCount()} {paneCount() === 1 ? "session" : "sessions"}
        </span>
        {projectName() && (
          <span class="status-item status-project" title={activeCwd()}>
            {projectName()}
          </span>
        )}
      </div>
      <div class="status-bar-right">
        {gitInfo() && (
          <span class="status-item status-git">
            <span class="status-git-branch">{gitInfo()!.branch}</span>
            {gitInfo()!.dirty && <span class="status-git-dirty">*</span>}
            {gitInfo()!.ahead > 0 && (
              <span class="status-git-ahead">{gitInfo()!.ahead}&#x2191;</span>
            )}
            {gitInfo()!.behind > 0 && (
              <span class="status-git-behind">{gitInfo()!.behind}&#x2193;</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
