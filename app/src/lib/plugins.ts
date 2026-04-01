import { createSignal } from "solid-js";
import type { Component } from "solid-js";
import { registerCommand } from "./commands";
import { setViewMode } from "./tasks";
import { getActivePaneSidebar, setActivePaneSidebar, getActivePaneOverlay, setActivePaneOverlay } from "./store";

// --- Types ---

export interface PluginManifest {
  id: string;
  name: string;
  icon: string;
  type: "sidebar" | "overlay" | "workspace";
  defaultSide?: "left" | "right";
}

export type SessionPlugin = {
  manifest: PluginManifest;
  component: Component<{ visible: boolean }>;
};

export interface WorkspacePluginProps {
  sessions: { id: string; cwd: string; agent?: string; effort?: string }[];
  activePaneId: string | null;
}

export type WorkspacePlugin = {
  manifest: PluginManifest;
  component: Component<WorkspacePluginProps>;
};

// --- State ---

const [sessionPlugins, setSessionPlugins] = createSignal<SessionPlugin[]>([]);
const [workspacePlugins, setWorkspacePlugins] = createSignal<WorkspacePlugin[]>([]);

// --- Actions ---

export function registerSessionPlugin(
  manifest: PluginManifest,
  component: Component<{ visible: boolean }>,
) {
  if (manifest.type !== "sidebar" && manifest.type !== "overlay") {
    throw new Error(
      `Session plugin "${manifest.id}" must have type "sidebar" or "overlay", got "${manifest.type}"`,
    );
  }
  setSessionPlugins((prev) => [...prev, { manifest, component }]);
  registerCommand({
    id: `toggle-plugin-${manifest.id}`,
    label: `Toggle ${manifest.name}`,
    action: () => toggleSessionPlugin(manifest.id),
  });
}

export function registerWorkspacePlugin(
  manifest: PluginManifest,
  component: Component<WorkspacePluginProps>,
) {
  if (manifest.type !== "workspace") {
    throw new Error(
      `Workspace plugin "${manifest.id}" must have type "workspace", got "${manifest.type}"`,
    );
  }
  setWorkspacePlugins((prev) => [...prev, { manifest, component }]);
  registerCommand({
    id: `view-plugin-${manifest.id}`,
    label: `View ${manifest.name}`,
    action: () => setViewMode(`plugin-${manifest.id}`),
  });
}

export function registerPluginCommand(
  pluginId: string,
  name: string,
  handler: () => void,
) {
  registerCommand({
    id: `plugin:${pluginId}:${name}`,
    label: name,
    action: handler,
  });
}

export function getSessionPlugins(): SessionPlugin[] {
  return sessionPlugins();
}

export function getWorkspacePlugins(): WorkspacePlugin[] {
  return workspacePlugins();
}

export function getSidebarPlugins(): SessionPlugin[] {
  return sessionPlugins().filter((p) => p.manifest.type === "sidebar");
}

export function getOverlayPlugins(): SessionPlugin[] {
  return sessionPlugins().filter((p) => p.manifest.type === "overlay");
}

export function getActiveSidebar(): string | null {
  return getActivePaneSidebar();
}

export function getActiveOverlay(): string | null {
  return getActivePaneOverlay();
}

export function getSessionPluginVisibility(id: string): boolean {
  const plugin = sessionPlugins().find((p) => p.manifest.id === id);
  if (!plugin) return false;
  if (plugin.manifest.type === "sidebar") {
    return getActivePaneSidebar() === id;
  }
  return getActivePaneOverlay() === id;
}

export function toggleSessionPlugin(id: string) {
  const plugin = sessionPlugins().find((p) => p.manifest.id === id);
  if (!plugin) return;
  if (plugin.manifest.type === "sidebar") {
    setActivePaneSidebar(getActivePaneSidebar() === id ? null : id);
  } else {
    setActivePaneOverlay(getActivePaneOverlay() === id ? null : id);
  }
}

export function showSessionOverlay(id: string) {
  setActivePaneOverlay(id);
}

export function dismissSessionOverlay() {
  setActivePaneOverlay(null);
}
