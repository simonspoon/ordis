import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";

// --- Types ---

export interface Project {
  name: string;
  path: string;
  has_limbo: boolean;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  action?: string;
  verify?: string;
  result?: string;
  outcome?: string;
  parent?: string | null;
  status: string;
  blockedBy?: string[];
  owner?: string;
  notes?: { content: string; timestamp: string }[];
  created?: string;
  updated?: string;
}

export interface ProjectState {
  project: Project;
  tasks: Task[];
  expanded: boolean;
  loading: boolean;
}

export type ViewMode = "dashboard" | "workspace";

// --- State ---

export const [viewMode, setViewMode] = createSignal<ViewMode>("dashboard");
export const [projects, setProjects] = createStore<Record<string, ProjectState>>({});
export const [projectsLoading, setProjectsLoading] = createSignal(false);
export const [selectedTaskId, setSelectedTaskId] = createSignal<{ project: string; taskId: string } | null>(null);

// --- Derived ---

export function getProjectList(): ProjectState[] {
  return Object.values(projects).sort((a, b) => a.project.name.localeCompare(b.project.name));
}

export function getTaskTree(projectName: string): Task[] {
  const state = projects[projectName];
  if (!state) return [];
  return state.tasks;
}

export function getRootTasks(projectName: string): Task[] {
  const tasks = getTaskTree(projectName);
  return tasks.filter((t) => !t.parent);
}

export function getChildTasks(projectName: string, parentId: string): Task[] {
  const tasks = getTaskTree(projectName);
  return tasks.filter((t) => t.parent === parentId);
}

export function getTaskCounts(projectName: string): { todo: number; inProgress: number; done: number } {
  const tasks = getTaskTree(projectName);
  return {
    todo: tasks.filter((t) => t.status === "todo").length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };
}

// --- Actions ---

export async function loadProjects() {
  setProjectsLoading(true);
  try {
    const list = await invoke<Project[]>("list_projects");
    const current = { ...projects };
    for (const p of list) {
      if (!current[p.name]) {
        setProjects(p.name, { project: p, tasks: [], expanded: false, loading: false });
      } else {
        setProjects(p.name, "project", p);
      }
    }
    // Remove projects no longer in config
    for (const name of Object.keys(current)) {
      if (!list.find((p) => p.name === name)) {
        setProjects(produce((s) => { delete s[name]; }));
      }
    }
  } finally {
    setProjectsLoading(false);
  }
}

export async function loadTasksForProject(projectName: string) {
  const state = projects[projectName];
  if (!state || !state.project.has_limbo) return;

  setProjects(projectName, "loading", true);
  try {
    const tasks = await invoke<Task[]>("list_tasks", { projectPath: state.project.path });
    setProjects(projectName, "tasks", tasks);
  } catch (e) {
    console.error(`Failed to load tasks for ${projectName}:`, e);
    setProjects(projectName, "tasks", []);
  } finally {
    setProjects(projectName, "loading", false);
  }
}

export function toggleProject(projectName: string) {
  const state = projects[projectName];
  if (!state) return;
  const wasExpanded = state.expanded;
  setProjects(projectName, "expanded", !wasExpanded);
  if (!wasExpanded && state.project.has_limbo && state.tasks.length === 0) {
    loadTasksForProject(projectName);
  }
}

export async function refreshAll() {
  await loadProjects();
  const expanded = Object.values(projects).filter((p) => p.expanded && p.project.has_limbo);
  await Promise.all(expanded.map((p) => loadTasksForProject(p.project.name)));
}
