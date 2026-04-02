import type { Component } from "solid-js";
import {
  registerWorkspacePlugin,
  registerPluginCommand,
} from "../lib/plugins";
import type { WorkspacePluginProps } from "../lib/plugins";
import { setViewMode } from "../lib/tasks";
import Settings, { navigateToPanel } from "../components/Settings";

const SettingsPlugin: Component<WorkspacePluginProps> = () => {
  return <Settings />;
};

export function init() {
  registerWorkspacePlugin(
    { id: "settings", name: "Settings", icon: "⚙️", type: "workspace" },
    SettingsPlugin,
  );

  registerPluginCommand("settings", "Open Ordis Settings", () => {
    setViewMode("plugin-settings");
    navigateToPanel("ordis-general");
  });

  registerPluginCommand("settings", "Open Permissions", () => {
    setViewMode("plugin-settings");
    navigateToPanel("permissions");
  });

  registerPluginCommand("settings", "Open General Settings", () => {
    setViewMode("plugin-settings");
    navigateToPanel("general");
  });

  registerPluginCommand("settings", "Open Hooks", () => {
    setViewMode("plugin-settings");
    navigateToPanel("hooks");
  });

  registerPluginCommand("settings", "Open MCP Servers", () => {
    setViewMode("plugin-settings");
    navigateToPanel("mcp");
  });

  registerPluginCommand("settings", "Open CLAUDE.md", () => {
    setViewMode("plugin-settings");
    navigateToPanel("claudemd");
  });
}
