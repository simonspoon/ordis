import { createSignal, createResource, createEffect, For, Show } from "solid-js";
import type { Component } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { createViewerPane, activePaneId, panes } from "../lib/store";
import type { ViewerType } from "../lib/store";
import { registerSessionPlugin } from "../lib/plugins";

interface DirEntry {
  name: string;
  isDir: boolean;
  isFile: boolean;
  size: number;
  extension: string;
}

const extensionIcons: Record<string, string> = {
  rs: "RS",
  ts: "TS",
  tsx: "TSX",
  js: "JS",
  jsx: "JSX",
  py: "PY",
  go: "GO",
  c: "C",
  cpp: "C++",
  java: "JV",
  rb: "RB",
  swift: "SW",
  css: "CSS",
  html: "HTM",
  json: "{ }",
  yaml: "YML",
  yml: "YML",
  toml: "TML",
  md: "MD",
  mdx: "MDX",
  txt: "TXT",
  sh: "SH",
  sql: "SQL",
  xml: "XML",
  png: "PNG",
  jpg: "JPG",
  jpeg: "JPG",
  gif: "GIF",
  svg: "SVG",
  webp: "WP",
  pdf: "PDF",
  diff: "DIF",
  lock: "LCK",
  log: "LOG",
  csv: "CSV",
};

function getIcon(entry: DirEntry): string {
  if (entry.isDir) return "DIR";
  return extensionIcons[entry.extension.toLowerCase()] || "---";
}

function getViewerType(ext: string): ViewerType {
  const lower = ext.toLowerCase();
  if (["md", "mdx", "markdown"].includes(lower)) return "markdown";
  if (["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico", "avif"].includes(lower)) return "image";
  if (lower === "pdf") return "pdf";
  if (["diff", "patch"].includes(lower)) return "diff";
  return "code";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

const FileBrowser: Component<{ visible: boolean }> = (props) => {
  const [currentPath, setCurrentPath] = createSignal("");
  const [showHidden, setShowHidden] = createSignal(false);

  // Reactively track the active pane's cwd
  createEffect(async () => {
    const active = activePaneId();
    const pane = panes[active];
    if (pane?.cwd) {
      setCurrentPath(pane.cwd);
    } else {
      try {
        const cwd = await invoke<string>("get_cwd");
        setCurrentPath(cwd);
      } catch {
        setCurrentPath("/");
      }
    }
  });

  const [entries] = createResource(
    currentPath,
    async (path) => {
      if (!path) return [];
      try {
        return await invoke<DirEntry[]>("list_directory", { path });
      } catch {
        return [];
      }
    },
  );

  const filteredEntries = () => {
    const list = entries() || [];
    if (showHidden()) return list;
    return list.filter((e) => !e.name.startsWith("."));
  };

  const navigateUp = () => {
    const path = currentPath();
    if (!path || path === "/") return;
    const parent = path.substring(0, path.lastIndexOf("/")) || "/";
    setCurrentPath(parent);
  };

  const navigateTo = (name: string) => {
    const base = currentPath();
    const next = base === "/" ? `/${name}` : `${base}/${name}`;
    setCurrentPath(next);
  };

  const openFile = (name: string, ext: string) => {
    const base = currentPath();
    const filePath = base === "/" ? `/${name}` : `${base}/${name}`;
    const viewerType = getViewerType(ext);
    createViewerPane(filePath, viewerType, base);
  };

  const displayPath = () => {
    const path = currentPath();
    return path.replace(/^\/Users\/[^/]+/, "~");
  };

  return (
    <div class={`file-browser ${props.visible ? "" : "file-browser-hidden"}`}>
      <div class="file-browser-header">
        <span class="file-browser-title">Files</span>
        <button
          class="viewer-action"
          onClick={() => setShowHidden((v) => !v)}
          title={showHidden() ? "Hide dotfiles" : "Show dotfiles"}
          style={{ "font-size": "10px" }}
        >
          {showHidden() ? ".*" : "  "}
        </button>
        <button
          class="viewer-action"
          onClick={() => { const p = currentPath(); setCurrentPath(""); setTimeout(() => setCurrentPath(p), 10); }}
          title="Refresh"
          style={{ "font-size": "10px" }}
        >
          &#x21bb;
        </button>
      </div>
      <div class="file-browser-path" title={currentPath()}>
        {displayPath()}
      </div>
      <div class="file-browser-list">
        <Show when={currentPath() !== "/"}>
          <div class="file-browser-up" onClick={navigateUp}>
            <span class="file-entry-icon">..</span>
            <span class="file-entry-name">(up)</span>
          </div>
        </Show>
        <For each={filteredEntries()}>
          {(entry) => (
            <div
              class={`file-entry ${entry.isDir ? "file-entry-dir" : ""}`}
              onClick={() => {
                if (entry.isDir) {
                  navigateTo(entry.name);
                } else {
                  openFile(entry.name, entry.extension);
                }
              }}
              title={entry.name}
            >
              <span class="file-entry-icon">{getIcon(entry)}</span>
              <span class="file-entry-name">{entry.name}</span>
              <Show when={entry.isFile && entry.size > 0}>
                <span class="file-entry-size">{formatSize(entry.size)}</span>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export function init() {
  registerSessionPlugin(
    { id: "file-browser", name: "Files", icon: "\u{1F4C1}", type: "sidebar", defaultSide: "left" },
    FileBrowser,
  );
}
