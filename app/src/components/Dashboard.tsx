import { onMount, For, Show, createMemo } from "solid-js";
import {
  projects, projectsLoading,
  loadProjects, loadTasksForProject, toggleProject,
  getProjectList, getFilteredRootTasks, getFilteredChildTasks, getTaskCounts,
  selectedTaskId, setSelectedTaskId,
  setViewMode,
  statusFilter, setStatusFilter,
  searchFilter, setSearchFilter,
  type Task, type StatusFilter,
} from "../lib/tasks";
import { createPane } from "../lib/store";

const STATUS_LABELS: Record<string, string> = {
  "todo": "Todo",
  "in-progress": "In Progress",
  "done": "Done",
};

export default function Dashboard() {
  onMount(() => {
    loadProjects();
  });

  const projectList = createMemo(() => getProjectList());
  const hasActiveFilters = createMemo(() => statusFilter() !== "all" || searchFilter() !== "");

  return (
    <div class="dashboard">
      <div class="dashboard-header">
        <h1 class="dashboard-title">Projects</h1>
        <div class="dashboard-filters">
          <div class="filter-status-group">
            <For each={["all", "todo", "in-progress", "done"] as StatusFilter[]}>
              {(s) => (
                <button
                  class={`filter-status-btn ${statusFilter() === s ? "filter-status-btn-active" : ""} ${s !== "all" ? `filter-status-btn-${s}` : ""}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "all" ? "All" : STATUS_LABELS[s]}
                </button>
              )}
            </For>
          </div>
          <input
            class="filter-search"
            type="text"
            placeholder="Search tasks..."
            value={searchFilter()}
            onInput={(e) => setSearchFilter(e.currentTarget.value)}
          />
          <Show when={hasActiveFilters()}>
            <button class="filter-clear" onClick={() => { setStatusFilter("all"); setSearchFilter(""); }} title="Clear filters">
              &times;
            </button>
          </Show>
        </div>
        <button class="dashboard-refresh" onClick={() => loadProjects()} title="Refresh">
          &#x21bb;
        </button>
      </div>
      <Show when={!projectsLoading()} fallback={<div class="dashboard-loading">Loading projects...</div>}>
        <div class="project-grid">
          <For each={projectList()}>
            {(state) => <ProjectCard state={state} />}
          </For>
        </div>
      </Show>
    </div>
  );
}

function ProjectCard(props: { state: ReturnType<typeof getProjectList>[0] }) {
  const counts = createMemo(() => getTaskCounts(props.state.project.name));
  const rootTasks = createMemo(() => getFilteredRootTasks(props.state.project.name));
  const total = createMemo(() => counts().todo + counts().inProgress + counts().done);
  const expanded = () => props.state.expanded;
  const loading = () => props.state.loading;

  return (
    <div class={`project-card ${expanded() ? "project-card-expanded" : ""}`}>
      <div class="project-card-header" onClick={() => toggleProject(props.state.project.name)}>
        <span class="project-card-chevron">{expanded() ? "\u25BC" : "\u25B6"}</span>
        <span class="project-card-name">{props.state.project.name}</span>
        <Show when={props.state.project.has_limbo}>
          <span class="project-card-badges">
            <Show when={counts().inProgress > 0}>
              <span class="badge badge-in-progress">{counts().inProgress} in progress</span>
            </Show>
            <Show when={counts().todo > 0}>
              <span class="badge badge-todo">{counts().todo} todo</span>
            </Show>
            <Show when={counts().done > 0}>
              <span class="badge badge-done">{counts().done} done</span>
            </Show>
            <Show when={total() === 0}>
              <span class="project-card-no-tasks">0 tasks</span>
            </Show>
          </span>
        </Show>
        <Show when={!props.state.project.has_limbo}>
          <span class="project-card-no-tasks">no limbo</span>
        </Show>
      </div>
      <Show when={expanded() && props.state.project.has_limbo}>
        <div class="project-card-body">
          <Show when={loading()}>
            <div class="task-loading">Loading...</div>
          </Show>
          <Show when={!loading() && rootTasks().length === 0}>
            <div class="task-empty">No matching tasks</div>
          </Show>
          <Show when={!loading() && rootTasks().length > 0}>
            <div class="task-list">
              <For each={rootTasks()}>
                {(task) => (
                  <TaskItem
                    task={task}
                    projectName={props.state.project.name}
                    projectPath={props.state.project.path}
                    depth={0}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function TaskItem(props: { task: Task; projectName: string; projectPath: string; depth: number }) {
  const children = createMemo(() => getFilteredChildTasks(props.projectName, props.task.id));
  const isSelected = createMemo(() => {
    const sel = selectedTaskId();
    return sel?.project === props.projectName && sel?.taskId === props.task.id;
  });

  const statusClass = () => {
    switch (props.task.status) {
      case "in-progress": return "status-dot-in-progress";
      case "done": return "status-dot-done";
      default: return "status-dot-todo";
    }
  };

  const statusLabel = () => STATUS_LABELS[props.task.status] || props.task.status;

  const handleSelect = () => {
    if (isSelected()) {
      setSelectedTaskId(null);
    } else {
      setSelectedTaskId({ project: props.projectName, taskId: props.task.id });
    }
  };

  const handleLaunch = (e: MouseEvent) => {
    e.stopPropagation();
    createPane(props.projectPath);
    setViewMode("workspace");
  };

  return (
    <>
      <div
        class={`task-item ${isSelected() ? "task-item-selected" : ""}`}
        style={{ "padding-left": `${12 + props.depth * 16}px` }}
        onClick={handleSelect}
      >
        <span class={`status-dot ${statusClass()}`} title={statusLabel()} />
        <span class={`task-status-label task-status-${props.task.status}`}>{statusLabel()}</span>
        <span class="task-id">{props.task.id}</span>
        <span class="task-name">{props.task.name}</span>
        <button class="task-launch" onClick={handleLaunch} title="Launch session">
          &#x25B6;
        </button>
      </div>
      <Show when={isSelected()}>
        <div class="task-detail" style={{ "padding-left": `${28 + props.depth * 16}px` }}>
          <Show when={props.task.action}>
            <div class="task-detail-field">
              <span class="task-detail-label">Action</span>
              <span>{props.task.action}</span>
            </div>
          </Show>
          <Show when={props.task.verify}>
            <div class="task-detail-field">
              <span class="task-detail-label">Verify</span>
              <span>{props.task.verify}</span>
            </div>
          </Show>
          <Show when={props.task.result}>
            <div class="task-detail-field">
              <span class="task-detail-label">Result</span>
              <span>{props.task.result}</span>
            </div>
          </Show>
          <Show when={props.task.owner}>
            <div class="task-detail-field">
              <span class="task-detail-label">Owner</span>
              <span>{props.task.owner}</span>
            </div>
          </Show>
          <Show when={props.task.notes && props.task.notes.length > 0}>
            <div class="task-detail-field">
              <span class="task-detail-label">Notes</span>
              <For each={props.task.notes}>
                {(note) => <div class="task-note">{note.content}</div>}
              </For>
            </div>
          </Show>
        </div>
      </Show>
      <For each={children()}>
        {(child) => (
          <TaskItem
            task={child}
            projectName={props.projectName}
            projectPath={props.projectPath}
            depth={props.depth + 1}
          />
        )}
      </For>
    </>
  );
}
