import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "./toast";

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

export interface TaskTemplate {
  name: string;
  description?: string;
  action?: string;
  verify?: string;
  result?: string;
}

export interface ProjectState {
  project: Project;
  tasks: Task[];
  expanded: boolean;
  loading: boolean;
}

export type ViewMode = "dashboard" | "workspace" | "settings" | `plugin-${string}`;
export type DashboardView = "list" | "kanban" | "graph" | "timeline";
export type StatusFilter = "all" | "todo" | "in-progress" | "done";

// --- State ---

export const [viewMode, setViewMode] = createSignal<ViewMode>("dashboard");
export const [dashboardView, setDashboardView] = createSignal<DashboardView>("list");
export const [projects, setProjects] = createStore<Record<string, ProjectState>>({});
export const [projectsLoading, setProjectsLoading] = createSignal(false);
export const [selectedTaskId, setSelectedTaskId] = createSignal<{ project: string; taskId: string } | null>(null);
export const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all");
export const [searchFilter, setSearchFilter] = createSignal("");
export const [selectedTasks, setSelectedTasks] = createSignal<Set<string>>(new Set());
export const [templates, setTemplates] = createSignal<TaskTemplate[]>([]);

// --- Selection Helpers ---

export function toggleTaskSelection(taskId: string) {
  setSelectedTasks((prev) => {
    const next = new Set(prev);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    return next;
  });
}

export function selectAllTasks(taskIds: string[]) {
  setSelectedTasks(new Set(taskIds));
}

export function clearSelection() {
  setSelectedTasks(new Set<string>());
}

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

function matchesSearch(task: Task, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    task.name.toLowerCase().includes(q) ||
    !!task.id?.toLowerCase().includes(q) ||
    !!task.action?.toLowerCase().includes(q) ||
    !!task.owner?.toLowerCase().includes(q)
  );
}

function matchesFilters(task: Task): boolean {
  const status = statusFilter();
  const query = searchFilter();
  if (status !== "all" && task.status !== status) return false;
  return matchesSearch(task, query);
}

export function getFilteredRootTasks(projectName: string): Task[] {
  const tasks = getTaskTree(projectName);
  const status = statusFilter();
  const query = searchFilter();
  if (status === "all" && !query) return tasks.filter((t) => !t.parent);
  // Include a root task if it or any of its descendants match
  const matchingIds = new Set<string>();
  for (const t of tasks) {
    if (matchesFilters(t)) {
      matchingIds.add(t.id);
      // Walk up to include ancestors
      let cur = t;
      while (cur.parent) {
        matchingIds.add(cur.parent);
        const parent = tasks.find((p) => p.id === cur.parent);
        if (!parent) break;
        cur = parent;
      }
    }
  }
  return tasks.filter((t) => !t.parent && matchingIds.has(t.id));
}

export function getFilteredChildTasks(projectName: string, parentId: string): Task[] {
  const tasks = getTaskTree(projectName);
  const status = statusFilter();
  const query = searchFilter();
  if (status === "all" && !query) return tasks.filter((t) => t.parent === parentId);
  const matchingIds = new Set<string>();
  for (const t of tasks) {
    if (matchesFilters(t)) {
      matchingIds.add(t.id);
      let cur = t;
      while (cur.parent) {
        matchingIds.add(cur.parent);
        const parent = tasks.find((p) => p.id === cur.parent);
        if (!parent) break;
        cur = parent;
      }
    }
  }
  return tasks.filter((t) => t.parent === parentId && matchingIds.has(t.id));
}

// --- Actions ---

export async function loadTemplates() {
  try {
    const list = await invoke<TaskTemplate[]>("list_templates");
    setTemplates(list);
  } catch {
    // Templates are optional — config may not have any
    setTemplates([]);
  }
}

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
    // Eagerly load tasks for all limbo-enabled projects so counts are visible
    await Promise.all(
      list.filter((p) => p.has_limbo).map((p) => loadTasksForProject(p.name))
    );
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
    toast.error(`Failed to load tasks for ${projectName}: ${e}`);
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

// --- Mutations ---

const STATUS_CYCLE: Record<string, string> = {
  "todo": "in-progress",
  "in-progress": "done",
  "done": "todo",
};

export function nextStatus(current: string): string {
  return STATUS_CYCLE[current] || "todo";
}

export async function updateTaskStatus(
  projectName: string,
  projectPath: string,
  taskId: string,
  status: string,
  outcome?: string,
) {
  try {
    const tasks = await invoke<Task[]>("update_task_status", {
      projectPath,
      taskId,
      status,
      outcome: outcome || null,
    });
    setProjects(projectName, "tasks", tasks);
  } catch (e) {
    toast.error(`Failed to update task ${taskId}: ${e}`);
  }
}

export async function addTask(
  projectName: string,
  projectPath: string,
  name: string,
  opts?: {
    description?: string;
    action?: string;
    verify?: string;
    result?: string;
    parent?: string;
  },
) {
  try {
    const tasks = await invoke<Task[]>("add_task", {
      projectPath,
      name,
      description: opts?.description || null,
      action: opts?.action || null,
      verify: opts?.verify || null,
      result: opts?.result || null,
      parent: opts?.parent || null,
    });
    setProjects(projectName, "tasks", tasks);
  } catch (e) {
    toast.error(`Failed to add task: ${e}`);
  }
}

export async function editTask(
  projectName: string,
  projectPath: string,
  taskId: string,
  fields: {
    name?: string;
    description?: string;
    action?: string;
    verify?: string;
    result?: string;
  },
) {
  try {
    const tasks = await invoke<Task[]>("edit_task", {
      projectPath,
      taskId,
      name: fields.name || null,
      description: fields.description || null,
      action: fields.action || null,
      verify: fields.verify || null,
      result: fields.result || null,
    });
    setProjects(projectName, "tasks", tasks);
  } catch (e) {
    toast.error(`Failed to edit task ${taskId}: ${e}`);
  }
}

export async function addTaskNote(
  projectName: string,
  projectPath: string,
  taskId: string,
  message: string,
) {
  try {
    const tasks = await invoke<Task[]>("add_task_note", {
      projectPath,
      taskId,
      message,
    });
    setProjects(projectName, "tasks", tasks);
  } catch (e) {
    toast.error(`Failed to add note to ${taskId}: ${e}`);
  }
}

export async function deleteTask(
  projectName: string,
  projectPath: string,
  taskId: string,
) {
  try {
    const tasks = await invoke<Task[]>("delete_task", {
      projectPath,
      taskId,
    });
    setProjects(projectName, "tasks", tasks);
    // Clear selection if deleted task was selected
    const sel = selectedTaskId();
    if (sel?.project === projectName && sel?.taskId === taskId) {
      setSelectedTaskId(null);
    }
  } catch (e) {
    toast.error(`Failed to delete task ${taskId}: ${e}`);
  }
}

export async function blockTask(
  projectName: string,
  projectPath: string,
  blockerId: string,
  blockedId: string,
) {
  try {
    const tasks = await invoke<Task[]>("block_task", {
      projectPath,
      blockerId,
      blockedId,
    });
    setProjects(projectName, "tasks", tasks);
  } catch (e) {
    toast.error(`Failed to block task: ${e}`);
  }
}

export async function unblockTask(
  projectName: string,
  projectPath: string,
  blockerId: string,
  blockedId: string,
) {
  try {
    const tasks = await invoke<Task[]>("unblock_task", {
      projectPath,
      blockerId,
      blockedId,
    });
    setProjects(projectName, "tasks", tasks);
  } catch (e) {
    toast.error(`Failed to unblock task: ${e}`);
  }
}

// --- Live Updates ---

export async function setupTaskListener(): Promise<UnlistenFn> {
  return listen<{ project: string; tasks: Task[] }>("tasks-changed", (event) => {
    const { project, tasks } = event.payload;
    if (projects[project]) {
      setProjects(project, "tasks", tasks);
    }
  });
}
