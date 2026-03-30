import { onMount, onCleanup, For, Show, createMemo, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  panes, layout, activePaneId, setActivePaneId,
  createPane, createViewerPane, splitPane, closePane, toggleZoom, isZoomed,
  getLeafPaneIds, computeEffectivePositions, computeDividers,
  saveSession, restoreSession,
  saveWorkspace, loadWorkspace, listWorkspaces,
} from "./lib/store";
import type { ViewerType } from "./lib/store";
import { viewMode, setViewMode, setDashboardView } from "./lib/tasks";
import { toast } from "./lib/toast";
import { registerCommand, togglePalette, paletteOpen, closePalette } from "./lib/commands";
import PaneBar from "./components/PaneBar";
import TerminalPane from "./components/TerminalPane";
import ViewerPane from "./components/ViewerPane";
import SplitDivider from "./components/SplitDivider";
import Dashboard from "./components/Dashboard";
import TaskSidebar from "./components/TaskSidebar";
import FileBrowser from "./components/FileBrowser";
import ToastContainer from "./components/Toast";
import Settings from "./components/Settings";
import CommandPalette from "./components/CommandPalette";
import StatusBar from "./components/StatusBar";
import "./App.css";

export default function App() {
  const [sidebarVisible, setSidebarVisible] = createSignal(false);
  const [fileBrowserVisible, setFileBrowserVisible] = createSignal(false);

  // Register commands
  onMount(() => {
    registerCommand({
      id: "view-dashboard",
      label: "Switch to Dashboard",
      shortcut: "Cmd+1",
      action: () => setViewMode("dashboard"),
    });
    registerCommand({
      id: "view-workspace",
      label: "Switch to Workspace",
      shortcut: "Cmd+2",
      action: () => switchToWorkspace(),
    });
    registerCommand({
      id: "view-settings",
      label: "Open Settings",
      shortcut: "Cmd+,",
      action: () => setViewMode("settings"),
    });
    registerCommand({
      id: "view-kanban",
      label: "Switch to Kanban View",
      action: () => { setViewMode("dashboard"); setDashboardView("kanban"); },
    });
    registerCommand({
      id: "view-list",
      label: "Switch to List View",
      action: () => { setViewMode("dashboard"); setDashboardView("list"); },
    });
    registerCommand({
      id: "view-graph",
      label: "Switch to Dependency Graph",
      action: () => { setViewMode("dashboard"); setDashboardView("graph"); },
    });
    registerCommand({
      id: "view-timeline",
      label: "Switch to Timeline",
      action: () => { setViewMode("dashboard"); setDashboardView("timeline"); },
    });
    registerCommand({
      id: "toggle-sidebar",
      label: "Toggle Task Sidebar",
      shortcut: "Cmd+B",
      action: () => setSidebarVisible((v) => !v),
    });
    registerCommand({
      id: "toggle-file-browser",
      label: "Toggle File Browser",
      shortcut: "Cmd+E",
      action: () => {
        setFileBrowserVisible((v) => !v);
        if (!fileBrowserVisible()) setViewMode("workspace");
      },
    });
    registerCommand({
      id: "open-file",
      label: "Open File...",
      shortcut: "Cmd+O",
      action: async () => {
        try {
          const { open } = await import("@tauri-apps/plugin-dialog");
          const selected = await open({
            multiple: false,
            title: "Open file in viewer",
          });
          if (selected) {
            const viewerType = await invoke<string>("detect_file_type", { path: selected });
            createViewerPane(selected, viewerType as ViewerType);
            setViewMode("workspace");
          }
        } catch (e) {
          toast.error(`Failed to open file: ${e}`);
        }
      },
    });
    registerCommand({
      id: "split-vertical",
      label: "Split Pane Vertical",
      shortcut: "Cmd+D",
      action: () => splitPane("vertical"),
    });
    registerCommand({
      id: "split-horizontal",
      label: "Split Pane Horizontal",
      shortcut: "Cmd+Shift+D",
      action: () => splitPane("horizontal"),
    });
    registerCommand({
      id: "close-pane",
      label: "Close Current Pane",
      shortcut: "Cmd+W",
      action: () => {
        const active = activePaneId();
        if (active && (getLeafPaneIds().length > 1 || panes[active]?.paneType === "viewer")) closePane(active);
      },
    });
    registerCommand({
      id: "zoom-pane",
      label: "Toggle Pane Zoom",
      shortcut: "Cmd+Shift+Enter",
      action: () => toggleZoom(),
    });
    registerCommand({
      id: "new-session",
      label: "New Terminal Session",
      action: async () => {
        const cwd = await invoke<string>("get_cwd");
        createPane(cwd);
        setViewMode("workspace");
      },
    });

    // Load profiles and register as commands
    invoke<Array<{ name: string; cwd: string | null; agent: string | null; prompt: string | null }>>("list_profiles")
      .then((profiles) => {
        for (const profile of profiles) {
          registerCommand({
            id: `profile-${profile.name}`,
            label: `Launch Profile: ${profile.name}`,
            action: () => {
              const cwd = profile.cwd || "";
              createPane(cwd, {
                agent: profile.agent || undefined,
                prompt: profile.prompt || undefined,
              });
              setViewMode("workspace");
            },
          });
        }
      })
      .catch(() => { /* Profiles are optional */ });

    // Register workspace commands
    registerCommand({
      id: "save-workspace",
      label: "Save Workspace As...",
      action: async () => {
        const name = window.prompt("Workspace name:");
        if (!name?.trim()) return;
        try {
          await saveWorkspace(name.trim());
          toast.info(`Workspace "${name.trim()}" saved`);
          refreshWorkspaceCommands();
        } catch (e) {
          toast.error(`Failed to save workspace: ${e}`);
        }
      },
    });

    refreshWorkspaceCommands();
  });

  // Startup checks and session restore
  onMount(async () => {
    // Run startup checks
    try {
      const checks = await invoke<{ limbo_available: boolean; config_error: string | null }>("check_startup");
      if (!checks.limbo_available) {
        toast.warning("limbo CLI not found — task management features are unavailable");
      }
      if (checks.config_error) {
        toast.error(`Config error: ${checks.config_error}`);
      }
    } catch {
      // Startup checks are best-effort
    }

    // Request notification permission
    try {
      const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === "granted";
      }
      if (!granted) {
        toast.info("Desktop notifications are disabled — enable in system settings to get task alerts");
      }
    } catch {
      // Notification plugin may not be available
    }

    // Restore previous session
    const restored = await restoreSession();
    if (restored) {
      setViewMode("workspace");
    }
  });

  // Save session on window close
  onMount(() => {
    const onBeforeUnload = () => {
      saveSession();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    onCleanup(() => window.removeEventListener("beforeunload", onBeforeUnload));
  });

  // Keyboard shortcuts
  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape closes palette (no meta key needed)
      if (e.key === "Escape" && paletteOpen()) {
        e.preventDefault();
        closePalette();
        return;
      }

      if (!e.metaKey) return;

      // Command palette: Cmd+K (global)
      if (e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        togglePalette();
        return;
      }

      // View mode: Cmd+1 = Dashboard, Cmd+2 = Workspace
      if (e.key === "1" && !e.shiftKey && viewMode() !== "dashboard") {
        e.preventDefault();
        setViewMode("dashboard");
        return;
      }
      if (e.key === "2" && !e.shiftKey && viewMode() !== "workspace") {
        e.preventDefault();
        switchToWorkspace();
        return;
      }

      // Settings: Cmd+,
      if (e.key === "," && !e.shiftKey) {
        e.preventDefault();
        setViewMode("settings");
        return;
      }

      // Sidebar toggle: Cmd+B
      if (e.key === "b" && !e.shiftKey) {
        e.preventDefault();
        setSidebarVisible((v) => !v);
        return;
      }

      // File browser toggle: Cmd+E
      if (e.key === "e" && !e.shiftKey) {
        e.preventDefault();
        setFileBrowserVisible((v) => !v);
        if (viewMode() !== "workspace") setViewMode("workspace");
        return;
      }

      // Open file: Cmd+O
      if (e.key === "o" && !e.shiftKey) {
        e.preventDefault();
        import("@tauri-apps/plugin-dialog").then(async ({ open }) => {
          const selected = await open({ multiple: false, title: "Open file in viewer" });
          if (selected) {
            const viewerType = await invoke<string>("detect_file_type", { path: selected });
            createViewerPane(selected, viewerType as ViewerType);
            setViewMode("workspace");
          }
        }).catch(() => {});
        return;
      }

      // Workspace-only shortcuts
      if (viewMode() !== "workspace") return;

      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        toggleZoom();
      } else if (e.key === "d" && !e.shiftKey) {
        e.preventDefault();
        splitPane("vertical");
      } else if (e.key === "d" && e.shiftKey) {
        e.preventDefault();
        splitPane("horizontal");
      } else if (e.key === "w") {
        e.preventDefault();
        const active = activePaneId();
        if (active && (getLeafPaneIds().length > 1 || panes[active]?.paneType === "viewer")) closePane(active);
      } else if (e.key >= "3" && e.key <= "9") {
        e.preventDefault();
        const ids = getLeafPaneIds();
        const idx = parseInt(e.key) - 3;
        if (idx < ids.length) setActivePaneId(ids[idx]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  const switchToWorkspace = () => {
    setViewMode("workspace");
  };

  const refreshWorkspaceCommands = () => {
    listWorkspaces()
      .then((names) => {
        for (const name of names) {
          registerCommand({
            id: `workspace-load-${name}`,
            label: `Load Workspace: ${name}`,
            action: async () => {
              try {
                const loaded = await loadWorkspace(name);
                if (loaded) {
                  setViewMode("workspace");
                  toast.info(`Workspace "${name}" loaded`);
                } else {
                  toast.error(`Workspace "${name}" is empty or invalid`);
                }
              } catch (e) {
                toast.error(`Failed to load workspace: ${e}`);
              }
            },
          });
        }
      })
      .catch(() => { /* Workspaces are optional */ });
  };

  const positions = createMemo(() => computeEffectivePositions(layout()));
  const dividers = createMemo(() => isZoomed() ? [] : computeDividers(layout()));
  const leafIds = createMemo(() => getLeafPaneIds());

  return (
    <div class="app">
      <div class="titlebar">
        <span class="titlebar-title">Ordis</span>
        <div class="titlebar-tabs">
          <button
            class={`titlebar-tab ${viewMode() === "dashboard" ? "titlebar-tab-active" : ""}`}
            onClick={() => setViewMode("dashboard")}
          >
            Dashboard
          </button>
          <button
            class={`titlebar-tab ${viewMode() === "workspace" ? "titlebar-tab-active" : ""}`}
            onClick={switchToWorkspace}
          >
            Workspace
          </button>
          <button
            class={`titlebar-tab ${viewMode() === "settings" ? "titlebar-tab-active" : ""}`}
            onClick={() => setViewMode("settings")}
          >
            Settings
          </button>
        </div>
      </div>

      <Show when={viewMode() === "dashboard"}>
        <Dashboard />
      </Show>

      <Show when={viewMode() === "settings"}>
        <Settings />
      </Show>

      {/* Workspace view — always in DOM to preserve terminal sessions */}
      <div style={{ display: viewMode() === "workspace" ? "contents" : "none" }}>
        <PaneBar />
        <div class="workspace-layout">
          <TaskSidebar visible={sidebarVisible()} />
          <FileBrowser visible={fileBrowserVisible()} />
          <div class="terminal-container">
            <Show
              when={leafIds().length > 0}
              fallback={
                <div class="empty-state">
                  <span>No sessions</span>
                  <button
                    class="empty-state-btn"
                    onClick={async () => {
                      const cwd = await invoke<string>("get_cwd");
                      createPane(cwd);
                    }}
                  >
                    New Session
                  </button>
                </div>
              }
            >
              <For each={leafIds()}>
                {(id) => {
                  const pos = () => positions()[id];
                  const hidden = () => {
                    const p = pos();
                    return p ? p.w === 0 && p.h === 0 : false;
                  };
                  const isViewer = () => panes[id]?.paneType === "viewer";
                  return (
                    <Show when={panes[id] && pos()}>
                      <div
                        class="pane-position"
                        style={{
                          left: hidden() ? "0" : `${pos()!.x * 100}%`,
                          top: hidden() ? "0" : `${pos()!.y * 100}%`,
                          width: hidden() ? "0" : `${pos()!.w * 100}%`,
                          height: hidden() ? "0" : `${pos()!.h * 100}%`,
                          visibility: hidden() ? "hidden" : "visible",
                          overflow: hidden() ? "hidden" : "visible",
                        }}
                      >
                        <Show when={isViewer()} fallback={<TerminalPane paneId={id} />}>
                          <ViewerPane paneId={id} />
                        </Show>
                      </div>
                    </Show>
                  );
                }}
              </For>
              <For each={dividers()}>
                {(info) => <SplitDivider info={info} />}
              </For>
            </Show>
          </div>
        </div>
      </div>

      <StatusBar />

      <CommandPalette />
      <ToastContainer />
    </div>
  );
}
