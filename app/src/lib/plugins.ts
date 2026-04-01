import { createSignal } from "solid-js";
import type { Component } from "solid-js";
import { registerCommand } from "./commands";

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

export type WorkspacePlugin = {
  manifest: PluginManifest;
  component: Component;
};

// --- State ---

const [sessionPlugins, setSessionPlugins] = createSignal<SessionPlugin[]>([]);
const [workspacePlugins, setWorkspacePlugins] = createSignal<WorkspacePlugin[]>([]);
const [pluginVisibility, setPluginVisibility] = createSignal<Record<string, boolean>>({});

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
  component: Component,
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
    action: () => {},
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

export function getSessionPluginVisibility(id: string): boolean {
  return pluginVisibility()[id] ?? false;
}

export function toggleSessionPlugin(id: string) {
  setPluginVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
}
