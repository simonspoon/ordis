import { onMount, onCleanup, For, Show, createMemo, createSignal } from "solid-js";
import {
  projectsLoading,
  loadProjects, loadTemplates,
  getFilteredRootTasks, getFilteredChildTasks, getTaskCounts,
  activeProject, getActiveProjectState,
  selectedTaskId, setSelectedTaskId,
  setViewMode,
  dashboardView, setDashboardView,
  statusFilter, setStatusFilter,
  searchFilter, setSearchFilter,
  selectedTasks, toggleTaskSelection, selectAllTasks, clearSelection,
  templates,
  updateTaskStatus, addTask, editTask, addTaskNote, deleteTask,
  nextStatus, setupTaskListener,
  type Task, type StatusFilter, type TaskTemplate,
} from "../lib/tasks";
import { createPane } from "../lib/store";
import KanbanBoard from "./KanbanBoard";
import DependencyGraph from "./DependencyGraph";
import TaskTimeline from "./TaskTimeline";

const STATUS_LABELS: Record<string, string> = {
  "todo": "Todo",
  "in-progress": "In Progress",
  "done": "Done",
};

export default function Dashboard() {
  let unlisten: (() => void) | undefined;

  onMount(() => {
    loadProjects();
    loadTemplates();
    setupTaskListener().then((fn) => { unlisten = fn; });
  });

  onCleanup(() => {
    unlisten?.();
  });

  const projectState = createMemo(() => getActiveProjectState());
  const projectName = createMemo(() => activeProject());
  const hasActiveFilters = createMemo(() => statusFilter() !== "all" || searchFilter() !== "");
  const selectionCount = createMemo(() => selectedTasks().size);

  const allVisibleTaskIds = createMemo(() => {
    const name = projectName();
    if (!name) return [];
    const state = projectState();
    if (!state || !state.project.has_limbo) return [];
    const ids: string[] = [];
    const tasks = getFilteredRootTasks(name);
    const collectIds = (taskList: Task[]) => {
      for (const t of taskList) {
        ids.push(t.id);
        const children = getFilteredChildTasks(name, t.id);
        collectIds(children);
      }
    };
    collectIds(tasks);
    return ids;
  });

  const handleBulkStatus = async (status: string) => {
    const state = projectState();
    if (!state) return;
    const ids = [...selectedTasks()];
    for (const taskId of ids) {
      const task = state.tasks.find((t: Task) => t.id === taskId);
      if (task) {
        await updateTaskStatus(state.project.name, state.project.path, taskId, status);
      }
    }
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const state = projectState();
    if (!state) return;
    const ids = [...selectedTasks()];
    for (const taskId of ids) {
      const task = state.tasks.find((t: Task) => t.id === taskId);
      if (task) {
        await deleteTask(state.project.name, state.project.path, taskId);
      }
    }
    clearSelection();
  };

  return (
    <div class="dashboard">
      <Show when={projectName()} fallback={
        <div class="dashboard-empty-state">
          <span class="dashboard-empty-text">Select a project from the sidebar</span>
        </div>
      }>
        <div class="dashboard-header">
          <h1 class="dashboard-title">{projectName()}</h1>
          <div class="dashboard-view-toggle">
            <button
              class={`view-toggle-btn ${dashboardView() === "list" ? "view-toggle-btn-active" : ""}`}
              onClick={() => setDashboardView("list")}
              title="List view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="2" width="12" height="1.5" rx="0.5" fill="currentColor"/>
                <rect x="1" y="6.25" width="12" height="1.5" rx="0.5" fill="currentColor"/>
                <rect x="1" y="10.5" width="12" height="1.5" rx="0.5" fill="currentColor"/>
              </svg>
            </button>
            <button
              class={`view-toggle-btn ${dashboardView() === "kanban" ? "view-toggle-btn-active" : ""}`}
              onClick={() => setDashboardView("kanban")}
              title="Kanban view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="3" height="12" rx="0.5" fill="currentColor"/>
                <rect x="5.5" y="1" width="3" height="8" rx="0.5" fill="currentColor"/>
                <rect x="10" y="1" width="3" height="10" rx="0.5" fill="currentColor"/>
              </svg>
            </button>
            <button
              class={`view-toggle-btn ${dashboardView() === "graph" ? "view-toggle-btn-active" : ""}`}
              onClick={() => setDashboardView("graph")}
              title="Dependency graph"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="3" cy="3" r="2" fill="currentColor"/>
                <circle cx="11" cy="3" r="2" fill="currentColor"/>
                <circle cx="7" cy="11" r="2" fill="currentColor"/>
                <line x1="4.5" y1="4" x2="6" y2="9.5" stroke="currentColor" stroke-width="1.2"/>
                <line x1="9.5" y1="4" x2="8" y2="9.5" stroke="currentColor" stroke-width="1.2"/>
              </svg>
            </button>
            <button
              class={`view-toggle-btn ${dashboardView() === "timeline" ? "view-toggle-btn-active" : ""}`}
              onClick={() => setDashboardView("timeline")}
              title="Timeline view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="2" width="8" height="2" rx="1" fill="currentColor"/>
                <rect x="4" y="6" width="9" height="2" rx="1" fill="currentColor"/>
                <rect x="2" y="10" width="6" height="2" rx="1" fill="currentColor"/>
              </svg>
            </button>
          </div>
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
          <Show when={dashboardView() === "kanban"} fallback={
            <Show when={dashboardView() === "graph"} fallback={
              <Show when={dashboardView() === "timeline"} fallback={
                <ProjectTaskList />
              }>
                <TaskTimeline />
              </Show>
            }>
              <DependencyGraph />
            </Show>
          }>
            <KanbanBoard />
          </Show>
        </Show>
        {/* Bulk Action Bar */}
        <Show when={selectionCount() > 0}>
          <div class="bulk-action-bar">
            <span class="bulk-action-count">{selectionCount()} selected</span>
            <div class="bulk-action-group">
              <button class="bulk-action-btn" onClick={() => handleBulkStatus("todo")}>
                <span class="status-dot status-dot-todo" /> Todo
              </button>
              <button class="bulk-action-btn" onClick={() => handleBulkStatus("in-progress")}>
                <span class="status-dot status-dot-in-progress" /> In Progress
              </button>
              <button class="bulk-action-btn" onClick={() => handleBulkStatus("done")}>
                <span class="status-dot status-dot-done" /> Done
              </button>
            </div>
            <button class="bulk-action-btn bulk-action-delete" onClick={handleBulkDelete}>Delete</button>
            <div class="bulk-action-sep" />
            <button class="bulk-action-btn" onClick={() => selectAllTasks(allVisibleTaskIds())}>Select All</button>
            <button class="bulk-action-btn" onClick={clearSelection}>Deselect All</button>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function ProjectTaskList() {
  const [addingTask, setAddingTask] = createSignal(false);
  const [showTemplatePicker, setShowTemplatePicker] = createSignal(false);
  const [newTaskName, setNewTaskName] = createSignal("");
  const [newTaskDesc, setNewTaskDesc] = createSignal("");
  const [newTaskAction, setNewTaskAction] = createSignal("");
  const [newTaskVerify, setNewTaskVerify] = createSignal("");
  const [newTaskResult, setNewTaskResult] = createSignal("");

  const projectState = createMemo(() => getActiveProjectState());
  const projectName = createMemo(() => activeProject());
  const rootTasks = createMemo(() => {
    const name = projectName();
    if (!name) return [];
    return getFilteredRootTasks(name);
  });
  const counts = createMemo(() => {
    const name = projectName();
    if (!name) return { todo: 0, inProgress: 0, done: 0 };
    return getTaskCounts(name);
  });
  const loading = createMemo(() => projectState()?.loading ?? false);

  const resetAddForm = () => {
    setNewTaskName("");
    setNewTaskDesc("");
    setNewTaskAction("");
    setNewTaskVerify("");
    setNewTaskResult("");
    setAddingTask(false);
    setShowTemplatePicker(false);
  };

  const applyTemplate = (tmpl: TaskTemplate | null) => {
    setShowTemplatePicker(false);
    setAddingTask(true);
    if (tmpl) {
      setNewTaskName(tmpl.name);
      setNewTaskDesc(tmpl.description || "");
      setNewTaskAction(tmpl.action || "");
      setNewTaskVerify(tmpl.verify || "");
      setNewTaskResult(tmpl.result || "");
    } else {
      setNewTaskName("");
      setNewTaskDesc("");
      setNewTaskAction("");
      setNewTaskVerify("");
      setNewTaskResult("");
    }
  };

  const handleAddTask = async () => {
    const state = projectState();
    const name = newTaskName().trim();
    if (!name || !state) return;
    await addTask(state.project.name, state.project.path, name, {
      description: newTaskDesc().trim() || undefined,
      action: newTaskAction().trim() || undefined,
      verify: newTaskVerify().trim() || undefined,
      result: newTaskResult().trim() || undefined,
    });
    resetAddForm();
  };

  const handleAddClick = () => {
    if (templates().length > 0) {
      setShowTemplatePicker(true);
    } else {
      applyTemplate(null);
    }
  };

  return (
    <div class="project-task-list">
      <div class="project-task-list-header">
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
        </span>
        <Show when={projectState()?.project.has_limbo}>
          <button class="project-add-btn" onClick={handleAddClick} title="Add task">+</button>
        </Show>
      </div>
      <Show when={loading()}>
        <div class="task-loading">Loading...</div>
      </Show>
      <Show when={!loading() && rootTasks().length === 0 && !addingTask()}>
        <div class="task-empty">No matching tasks</div>
      </Show>
      <Show when={!loading() && rootTasks().length > 0}>
        <div class="task-list">
          <For each={rootTasks()}>
            {(task) => {
              const state = projectState()!;
              return (
                <TaskItem
                  task={task}
                  projectName={state.project.name}
                  projectPath={state.project.path}
                  depth={0}
                />
              );
            }}
          </For>
        </div>
      </Show>
      <Show when={showTemplatePicker()}>
        <div class="template-picker">
          <button class="template-picker-option" onClick={() => applyTemplate(null)}>
            <span class="template-picker-name">Blank task</span>
            <span class="template-picker-desc">Start from scratch</span>
          </button>
          <For each={templates()}>
            {(tmpl) => (
              <button class="template-picker-option" onClick={() => applyTemplate(tmpl)}>
                <span class="template-picker-name">{tmpl.name}</span>
                <Show when={tmpl.description}>
                  <span class="template-picker-desc">{tmpl.description}</span>
                </Show>
              </button>
            )}
          </For>
          <button class="template-picker-cancel" onClick={() => setShowTemplatePicker(false)}>&times;</button>
        </div>
      </Show>
      <Show when={addingTask()}>
        <div class="add-task-form add-task-form-expanded">
          <input
            class="add-task-input"
            type="text"
            placeholder="Task name..."
            value={newTaskName()}
            onInput={(e) => setNewTaskName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleAddTask();
              if (e.key === "Escape") resetAddForm();
            }}
            ref={(el) => setTimeout(() => el.focus(), 0)}
          />
          <input
            class="add-task-input"
            type="text"
            placeholder="Description (optional)..."
            value={newTaskDesc()}
            onInput={(e) => setNewTaskDesc(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleAddTask();
              if (e.key === "Escape") resetAddForm();
            }}
          />
          <input
            class="add-task-input"
            type="text"
            placeholder="Action..."
            value={newTaskAction()}
            onInput={(e) => setNewTaskAction(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleAddTask();
              if (e.key === "Escape") resetAddForm();
            }}
          />
          <input
            class="add-task-input"
            type="text"
            placeholder="Verify..."
            value={newTaskVerify()}
            onInput={(e) => setNewTaskVerify(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleAddTask();
              if (e.key === "Escape") resetAddForm();
            }}
          />
          <input
            class="add-task-input"
            type="text"
            placeholder="Result..."
            value={newTaskResult()}
            onInput={(e) => setNewTaskResult(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleAddTask();
              if (e.key === "Escape") resetAddForm();
            }}
          />
          <div class="add-task-actions">
            <button class="add-task-submit" onClick={handleAddTask}>Add</button>
            <button class="add-task-cancel" onClick={resetAddForm}>&times;</button>
            <span class="add-task-hint">Cmd+Enter to submit</span>
          </div>
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
  const isChecked = createMemo(() => selectedTasks().has(props.task.id));

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
    const prompt = `Limbo task ${props.task.id} — "${props.task.name}"${props.task.action ? `\nAction: ${props.task.action}` : ""}\n\nPick up this task from limbo and execute it. The task ID is ${props.task.id}.`;
    createPane(props.projectPath, { agent: "swe-team:project-manager", prompt });
    setViewMode("sessions");
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
          class="task-checkbox"
          classList={{ "task-checkbox-checked": isChecked() }}
          onClick={(e) => { e.stopPropagation(); toggleTaskSelection(props.task.id); }}
        />
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
