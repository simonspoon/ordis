import type { Component } from "solid-js";
import {
  registerWorkspacePlugin,
  registerPluginCommand,
} from "../lib/plugins";
import type { WorkspacePluginProps } from "../lib/plugins";
import { setViewMode, setDashboardView } from "../lib/tasks";
import Dashboard from "../components/Dashboard";
import ProjectSidebar from "../components/ProjectSidebar";

const ProjectManagement: Component<WorkspacePluginProps> = () => {
  return (
    <div class="project-management-plugin">
      <ProjectSidebar />
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
