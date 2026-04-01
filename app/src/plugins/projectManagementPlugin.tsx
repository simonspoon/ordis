import { createSignal } from "solid-js";
import type { Component } from "solid-js";
import {
  registerWorkspacePlugin,
  registerPluginCommand,
} from "../lib/plugins";
import type { WorkspacePluginProps } from "../lib/plugins";
import { setViewMode, setDashboardView } from "../lib/tasks";
import Dashboard from "../components/Dashboard";
import TaskSidebar from "../components/TaskSidebar";

// Module-level signal so plugin commands can toggle sidebar visibility
const [sidebarVisible, setSidebarVisible] = createSignal(false);

const ProjectManagement: Component<WorkspacePluginProps> = () => {
  return (
    <div class="project-management-plugin">
      <TaskSidebar visible={sidebarVisible()} />
      <div class="project-management-main">
        <Dashboard />
      </div>
    </div>
  );
};

export function init() {
  registerWorkspacePlugin(
    { id: "project-management", name: "Projects", icon: "\uD83D\uDCCB", type: "workspace" },
    ProjectManagement,
  );

  registerPluginCommand("project-management", "Toggle Task Sidebar", () => {
    setSidebarVisible((v) => !v);
  });

  registerPluginCommand("project-management", "Switch to Kanban View", () => {
    setViewMode("plugin-project-management");
    setDashboardView("kanban");
  });

  registerPluginCommand("project-management", "Switch to List View", () => {
    setViewMode("plugin-project-management");
    setDashboardView("list");
  });

  registerPluginCommand("project-management", "Switch to Dependency Graph", () => {
    setViewMode("plugin-project-management");
    setDashboardView("graph");
  });

  registerPluginCommand("project-management", "Switch to Timeline", () => {
    setViewMode("plugin-project-management");
    setDashboardView("timeline");
  });
}
