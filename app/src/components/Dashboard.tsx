import { onMount, onCleanup, For, Show, createMemo, createSignal } from "solid-js";
import {
  projectsLoading,
  loadProjects, toggleProject,
  getProjectList, getFilteredRootTasks, getFilteredChildTasks, getTaskCounts,
  selectedTaskId, setSelectedTaskId,
  setViewMode,
  statusFilter, setStatusFilter,
  searchFilter, setSearchFilter,
  updateTaskStatus, addTask, editTask, addTaskNote, deleteTask,
  nextStatus, setupTaskListener,
  type Task, type StatusFilter,
} from "../lib/tasks";
import { createPane } from "../lib/store";

const STATUS_LABELS: Record<string, string> = {
  "todo": "Todo",
  "in-progress": "In Progress",
  "done": "Done",
};

export default function Dashboard() {
  let unlisten: (() => void) | undefined;

  onMount(() => {
    loadProjects();
    setupTaskListener().then((fn) => { unlisten = fn; });
  });

  onCleanup(() => {
    unlisten?.();
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
  const [addingTask, setAddingTask] = createSignal(false);
  const [newTaskName, setNewTaskName] = createSignal("");
  const counts = createMemo(() => getTaskCounts(props.state.project.name));
  const rootTasks = createMemo(() => getFilteredRootTasks(props.state.project.name));
  const total = createMemo(() => counts().todo + counts().inProgress + counts().done);
  const expanded = () => props.state.expanded;
  const loading = () => props.state.loading;

  const handleAddTask = async () => {
    const name = newTaskName().trim();
    if (!name) return;
    await addTask(props.state.project.name, props.state.project.path, name);
    setNewTaskName("");
    setAddingTask(false);
  };

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
          <button
            class="project-add-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (!expanded()) toggleProject(props.state.project.name);
              setAddingTask(true);
            }}
            title="Add task"
          >+</button>
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
          <Show when={!loading() && rootTasks().length === 0 && !addingTask()}>
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
          <Show when={addingTask()}>
            <div class="add-task-form">
              <input
                class="add-task-input"
                type="text"
                placeholder="Task name..."
                value={newTaskName()}
                onInput={(e) => setNewTaskName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddTask();
                  if (e.key === "Escape") { setAddingTask(false); setNewTaskName(""); }
                }}
                ref={(el) => setTimeout(() => el.focus(), 0)}
              />
              <button class="add-task-submit" onClick={handleAddTask}>Add</button>
              <button class="add-task-cancel" onClick={() => { setAddingTask(false); setNewTaskName(""); }}>&times;</button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function TaskItem(props: { task: Task; projectName: string; projectPath: string; depth: number }) {
  const [noteText, setNoteText] = createSignal("");
  const [editingField, setEditingField] = createSignal<string | null>(null);
  const [editValue, setEditValue] = createSignal("");
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

  const handleStatusCycle = (e: MouseEvent) => {
    e.stopPropagation();
    updateTaskStatus(
      props.projectName,
      props.projectPath,
      props.task.id,
      nextStatus(props.task.status),
    );
  };

  const handleLaunch = (e: MouseEvent) => {
    e.stopPropagation();
    createPane(props.projectPath);
    setViewMode("workspace");
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    deleteTask(props.projectName, props.projectPath, props.task.id);
  };

  const handleAddNote = () => {
    const text = noteText().trim();
    if (!text) return;
    addTaskNote(props.projectName, props.projectPath, props.task.id, text);
    setNoteText("");
  };

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    const field = editingField();
    const value = editValue().trim();
    if (!field || !value) { setEditingField(null); return; }
    editTask(props.projectName, props.projectPath, props.task.id, { [field]: value });
    setEditingField(null);
  };

  const renderField = (label: string, field: string, value: string | undefined) => {
    if (!value && !isSelected()) return null;
    return (
      <div class="task-detail-field">
        <span class="task-detail-label">{label}</span>
        <Show when={editingField() === field} fallback={
          <span
            class="task-detail-value"
            onClick={() => startEdit(field, value || "")}
            title="Click to edit"
          >{value || <span class="task-detail-empty">Click to set</span>}</span>
        }>
          <input
            class="task-edit-input"
            type="text"
            value={editValue()}
            onInput={(e) => setEditValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") setEditingField(null);
            }}
            onBlur={saveEdit}
            ref={(el) => setTimeout(() => el.focus(), 0)}
          />
        </Show>
      </div>
    );
  };

  return (
    <>
      <div
        class={`task-item ${isSelected() ? "task-item-selected" : ""}`}
        style={{ "padding-left": `${12 + props.depth * 16}px` }}
        onClick={handleSelect}
      >
        <span
          class={`status-dot status-dot-clickable ${statusClass()}`}
          title={`${statusLabel()} — click to cycle`}
          onClick={handleStatusCycle}
        />
        <span
          class={`task-status-label task-status-${props.task.status} task-status-clickable`}
          onClick={handleStatusCycle}
        >{statusLabel()}</span>
        <span class="task-id">{props.task.id}</span>
        <span class="task-name">{props.task.name}</span>
        <button class="task-delete-btn" onClick={handleDelete} title="Delete task">&times;</button>
        <button class="task-launch" onClick={handleLaunch} title="Launch session">
          &#x25B6;
        </button>
      </div>
      <Show when={isSelected()}>
        <div class="task-detail" style={{ "padding-left": `${28 + props.depth * 16}px` }}>
          {renderField("Action", "action", props.task.action)}
          {renderField("Verify", "verify", props.task.verify)}
          {renderField("Result", "result", props.task.result)}
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
          <div class="task-note-form">
            <input
              class="task-note-input"
              type="text"
              placeholder="Add note..."
              value={noteText()}
              onInput={(e) => setNoteText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddNote();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
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
