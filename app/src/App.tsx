import { onMount, onCleanup, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  panes, layout, activePaneId, setActivePaneId,
  createPane, splitPane, closePane, toggleZoom, isZoomed,
  getLeafPaneIds, computeEffectivePositions, computeDividers,
  saveSession, restoreSession,
  saveLayout, loadLayout, listLayouts,
  createTab, switchTab, closeTab, getTabs, getActiveTabId,
} from "./lib/store";
import { viewMode, setViewMode } from "./lib/tasks";
import { toast } from "./lib/toast";
import { registerCommand, togglePalette, paletteOpen, closePalette } from "./lib/commands";
import { clearArtifacts } from "./lib/artifacts";
import { getSessionPlugins, getWorkspacePlugins, getActiveSidebar, getActiveOverlay, dismissSessionOverlay, toggleSessionPlugin } from "./lib/plugins";
import { initializePlugins } from "./lib/pluginLoader";
import { openInViewer } from "./plugins/contentViewerPlugin";
import PaneBar from "./components/PaneBar";
import TerminalPane from "./components/TerminalPane";
import SplitDivider from "./components/SplitDivider";
import ToastContainer from "./components/Toast";
import CommandPalette from "./components/CommandPalette";
import StatusBar from "./components/StatusBar";
import ActivityBar from "./components/ActivityBar";
import "./App.css";

export default function App() {
  // Register commands
  onMount(() => {
    registerCommand({
      id: "view-dashboard",
      label: "Switch to Projects",
      shortcut: "Cmd+1",
      action: () => setViewMode("plugin-project-management"),
    });
    registerCommand({
      id: "view-sessions",
      label: "Switch to Sessions",
      shortcut: "Cmd+2",
      action: () => switchToSessions(),
    });
    registerCommand({
      id: "view-settings",
      label: "Open Settings",
      shortcut: "Cmd+,",
      action: () => setViewMode("plugin-settings"),
    });
    registerCommand({
      id: "toggle-file-browser",
      label: "Toggle File Browser",
      shortcut: "Cmd+E",
      action: () => {
        toggleSessionPlugin("file-browser");
        if (viewMode() !== "sessions") setViewMode("sessions");
      },
    });
    registerCommand({
      id: "toggle-artifact-sidebar",
      label: "Toggle Artifact Sidebar",
      shortcut: "Cmd+Shift+A",
      action: () => {
        toggleSessionPlugin("artifact-viewer");
        if (viewMode() !== "sessions") setViewMode("sessions");
      },
    });
    registerCommand({
      id: "clear-artifacts",
      label: "Clear Session Artifacts",
      action: () => clearArtifacts(activePaneId()),
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
            openInViewer(selected, viewerType);
            setViewMode("sessions");
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
        if (active) closePane(active);
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
        setViewMode("sessions");
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
              setViewMode("sessions");
            },
          });
        }
      })
      .catch(() => { /* Profiles are optional */ });

    // Register layout commands
    registerCommand({
      id: "save-layout",
      label: "Save Layout As...",
      action: async () => {
        const name = window.prompt("Layout name:");
        if (!name?.trim()) return;
        try {
          await saveLayout(name.trim());
          toast.info(`Layout "${name.trim()}" saved`);
          refreshLayoutCommands();
        } catch (e) {
          toast.error(`Failed to save layout: ${e}`);
        }
      },
    });

    registerCommand({
      id: "new-tab",
      label: "New Workspace Tab",
      shortcut: "Cmd+T",
      action: () => {
        const active = activePaneId();
        const cwd = panes[active]?.cwd || "";
        const name = cwd.split("/").pop() || "New Tab";
        createTab(name, cwd);
      },
    });
    registerCommand({
      id: "close-tab",
      label: "Close Workspace Tab",
      shortcut: "Cmd+Shift+W",
      action: () => {
        const id = getActiveTabId();
        if (id) closeTab(id);
      },
    });
    registerCommand({
      id: "prev-tab",
      label: "Previous Workspace Tab",
      shortcut: "Cmd+Shift+[",
      action: () => {
        const allTabs = getTabs();
        const idx = allTabs.findIndex(t => t.id === getActiveTabId());
        if (idx > 0) switchTab(allTabs[idx - 1].id);
      },
    });
    registerCommand({
      id: "next-tab",
      label: "Next Workspace Tab",
      shortcut: "Cmd+Shift+]",
      action: () => {
        const allTabs = getTabs();
        const idx = allTabs.findIndex(t => t.id === getActiveTabId());
        if (idx < allTabs.length - 1) switchTab(allTabs[idx + 1].id);
      },
    });

    refreshLayoutCommands();
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
      setViewMode("sessions");
    }
  });

  // Listen for CLI launch requests
  onMount(() => {
    let unlisten: (() => void) | undefined;
    listen<{ cwd: string; agent?: string; effort?: string; prompt?: string }>(
      "launch-session",
      (event) => {
        const { cwd, agent, effort, prompt } = event.payload;
        setViewMode("sessions");
        createPane(cwd, { agent: agent || undefined, effort: effort || undefined, prompt: prompt || undefined });
      },
    ).then((fn) => { unlisten = fn; });
    onCleanup(() => unlisten?.());
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

      // View mode: Cmd+1 = Projects, Cmd+2 = Sessions
      if (e.key === "1" && !e.shiftKey && viewMode() !== "plugin-project-management") {
        e.preventDefault();
        setViewMode("plugin-project-management");
        return;
      }
      if (e.key === "2" && !e.shiftKey && viewMode() !== "sessions") {
        e.preventDefault();
        switchToSessions();
        return;
      }

      // Settings: Cmd+,
      if (e.key === "," && !e.shiftKey) {
        e.preventDefault();
        setViewMode("plugin-settings");
        return;
      }

      // File browser toggle: Cmd+E
      if (e.key === "e" && !e.shiftKey) {
        e.preventDefault();
        toggleSessionPlugin("file-browser");
        if (viewMode() !== "sessions") setViewMode("sessions");
        return;
      }

      // Artifact sidebar toggle: Cmd+Shift+A
      if (e.key === "a" && e.shiftKey) {
        e.preventDefault();
        toggleSessionPlugin("artifact-viewer");
        if (viewMode() !== "sessions") setViewMode("sessions");
        return;
      }

      // Open file: Cmd+O
      if (e.key === "o" && !e.shiftKey) {
        e.preventDefault();
        import("@tauri-apps/plugin-dialog").then(async ({ open }) => {
          const selected = await open({ multiple: false, title: "Open file in viewer" });
          if (selected) {
            const viewerType = await invoke<string>("detect_file_type", { path: selected });
            openInViewer(selected, viewerType);
            setViewMode("sessions");
          }
        }).catch(() => {});
        return;
      }

      // Sessions-only shortcuts
      if (viewMode() !== "sessions") return;

      // Workspace tab shortcuts
      if (e.key === "t" && !e.shiftKey) {
        e.preventDefault();
        const active = activePaneId();
        const cwd = panes[active]?.cwd || "";
        const name = cwd.split("/").pop() || "New Tab";
        createTab(name, cwd);
        return;
      }
      if (e.key === "w" && e.shiftKey) {
        e.preventDefault();
        const id = getActiveTabId();
        if (id) closeTab(id);
        return;
      }
      if (e.key === "[" && e.shiftKey) {
        e.preventDefault();
        const allTabs = getTabs();
        const idx = allTabs.findIndex(t => t.id === getActiveTabId());
        if (idx > 0) switchTab(allTabs[idx - 1].id);
        return;
      }
      if (e.key === "]" && e.shiftKey) {
        e.preventDefault();
        const allTabs = getTabs();
        const idx = allTabs.findIndex(t => t.id === getActiveTabId());
        if (idx < allTabs.length - 1) switchTab(allTabs[idx + 1].id);
        return;
      }

      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        toggleZoom();
      } else if (e.key === "d" && !e.shiftKey) {
        e.preventDefault();
        splitPane("vertical");
      } else if (e.key === "d" && e.shiftKey) {
        e.preventDefault();
        splitPane("horizontal");
      } else if (e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        const active = activePaneId();
        if (active) closePane(active);
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

  // Initialize bundled plugins
  onMount(() => {
    initializePlugins();
  });

  const switchToSessions = () => {
    setViewMode("sessions");
  };

  const refreshLayoutCommands = () => {
    listLayouts()
      .then((names) => {
        for (const name of names) {
          registerCommand({
            id: `layout-load-${name}`,
            label: `Load Layout: ${name}`,
            action: async () => {
              try {
                const loaded = await loadLayout(name);
                if (loaded) {
                  setViewMode("sessions");
                  toast.info(`Layout "${name}" loaded`);
                } else {
                  toast.error(`Layout "${name}" is empty or invalid`);
                }
              } catch (e) {
                toast.error(`Failed to load layout: ${e}`);
              }
            },
          });
        }
      })
      .catch(() => { /* Layouts are optional */ });
  };

  const positions = createMemo(() => computeEffectivePositions(layout()));
  const dividers = createMemo(() => isZoomed() ? [] : computeDividers(layout()));
  const leafIds = createMemo(() => getLeafPaneIds());
  const allPaneIds = createMemo(() => {
    // Active tab's panes come from the live layout signal
    const activeIds = new Set(getLeafPaneIds());
    // Other tabs' panes come from their stored layouts
    for (const tab of getTabs()) {
      if (tab.id !== getActiveTabId()) {
        for (const id of getLeafPaneIds(tab.layout)) {
          activeIds.add(id);
        }
      }
    }
    return [...activeIds];
  });

  return (
    <div class="app">
      <div class="titlebar">
        <span class="titlebar-title">Ordis</span>
        <div class="titlebar-tabs">
          <button
            class={`titlebar-tab ${viewMode() === "sessions" ? "titlebar-tab-active" : ""}`}
            onClick={switchToSessions}
          >
            Sessions
          </button>
          <For each={getWorkspacePlugins()}>
            {(plugin) => (
              <button
                class={`titlebar-tab ${viewMode() === `plugin-${plugin.manifest.id}` ? "titlebar-tab-active" : ""}`}
                onClick={() => setViewMode(`plugin-${plugin.manifest.id}`)}
              >
                <span class="titlebar-tab-icon">{plugin.manifest.icon}</span>
                {plugin.manifest.name}
              </button>
            )}
          </For>
        </div>
      </div>

      <For each={getWorkspacePlugins()}>
        {(plugin) => (
          <Show when={viewMode() === `plugin-${plugin.manifest.id}`}>
            <plugin.component
              sessions={Object.values(panes).filter((p): p is NonNullable<typeof p> => p != null && p.paneType === "terminal").map((p) => ({ id: p.id, cwd: p.cwd, agent: p.agent, effort: p.effort }))}
              activePaneId={activePaneId()}
            />
          </Show>
        )}
      </For>

      {/* Sessions view — always in DOM to preserve terminal sessions */}
      <div style={{ display: viewMode() === "sessions" ? "contents" : "none" }}>
        <PaneBar />
        <div class="workspace-layout">
          <ActivityBar />
          <Show when={getActiveSidebar()}>
            {(activeId) => {
              const plugin = () => getSessionPlugins().find((p) => p.manifest.id === activeId());
              return (
                <Show when={plugin()}>
                  {(p) => {
                    const Comp = p().component;
                    return (
                      <div class={`plugin-sidebar plugin-sidebar-${p().manifest.defaultSide || "left"}`}>
                        <Comp visible={true} />
                      </div>
                    );
                  }}
                </Show>
              );
            }}
          </Show>
          <div class="terminal-container">
            <Show
              when={leafIds().length > 0 && getTabs().length > 0}
              fallback={
                <div class="empty-state">
                  <span>No sessions</span>
                  <button
                    class="empty-state-btn"
                    onClick={async () => {
                      let cwd = "";
                      try {
                        const raw = await invoke<string>("read_ordis_config");
                        const config = JSON.parse(raw);
                        cwd = config.defaultCwd || "";
                      } catch { /* ignore */ }
                      const name = cwd ? cwd.split("/").pop() || "Session" : "Session";
                      createTab(name, cwd);
                    }}
                  >
                    Create Session
                  </button>
                </div>
              }
            >
              <For each={allPaneIds()}>
                {(id) => {
                  const pos = () => positions()[id];
                  const isInActiveTab = () => !!pos();
                  const isZoomedOut = () => {
                    const p = pos();
                    return p ? p.w === 0 && p.h === 0 : false;
                  };
                  const hidden = () => !isInActiveTab() || isZoomedOut();
                  return (
                    <Show when={panes[id]}>
                      <div
                        class="pane-position"
                        style={{
                          left: isInActiveTab() ? `${pos()!.x * 100}%` : "0",
                          top: isInActiveTab() ? `${pos()!.y * 100}%` : "0",
                          width: isInActiveTab() ? `${pos()!.w * 100}%` : "100%",
                          height: isInActiveTab() ? `${pos()!.h * 100}%` : "100%",
                          visibility: hidden() ? "hidden" : "visible",
                          "pointer-events": hidden() ? "none" : "auto",
                          "z-index": hidden() ? "-1" : "auto",
                        }}
                      >
                        <TerminalPane paneId={id} />
                      </div>
                    </Show>
                  );
                }}
              </For>
              <For each={dividers()}>
                {(info) => <SplitDivider info={info} />}
              </For>
            </Show>
            <Show when={getActiveOverlay()}>
              {(activeId) => {
                const plugin = () => getSessionPlugins().find((p) => p.manifest.id === activeId());
                return (
                  <Show when={plugin()}>
                    {(p) => {
                      const Comp = p().component;
                      return (
                        <div class="plugin-overlay-pane">
                          <button class="plugin-overlay-dismiss" onClick={dismissSessionOverlay}>x</button>
                          <Comp visible={true} />
                        </div>
                      );
                    }}
                  </Show>
                );
              }}
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
