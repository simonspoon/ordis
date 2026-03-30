import { For, Show, createMemo } from "solid-js";
import {
  getProjectList,
  getTaskTree,
  updateTaskStatus,
  deleteTask,
  selectedTaskId, setSelectedTaskId,
  setViewMode,
  statusFilter, searchFilter,
  selectedTasks, toggleTaskSelection,
  type Task,
} from "../lib/tasks";
import { createPane } from "../lib/store";

const STATUS_COLUMNS = [
  { key: "todo", label: "Todo", color: "#56b6c2" },
  { key: "in-progress", label: "In Progress", color: "#e0a84e" },
  { key: "done", label: "Done", color: "#4ec9b0" },
] as const;

interface ColumnTasks {
  projectName: string;
  projectPath: string;
  tasks: Task[];
}

export default function KanbanBoard() {
  const projectList = createMemo(() => getProjectList().filter((p) => p.project.has_limbo));

  // Build column data: tasks grouped by status, then by project
  const columnData = createMemo(() => {
    const result: Record<string, ColumnTasks[]> = {
      "todo": [],
      "in-progress": [],
      "done": [],
    };

    const query = searchFilter().toLowerCase();
    const statusF = statusFilter();

    for (const state of projectList()) {
      const allTasks = getTaskTree(state.project.name);
      const filtered = allTasks.filter((t) => {
        // Apply search filter
        if (query) {
          const matches =
            t.name.toLowerCase().includes(query) ||
            t.id.toLowerCase().includes(query) ||
            (t.action?.toLowerCase().includes(query) ?? false) ||
            (t.owner?.toLowerCase().includes(query) ?? false);
          if (!matches) return false;
        }
        return true;
      });

      for (const col of STATUS_COLUMNS) {
        // Skip columns that don't match status filter (unless "all")
        if (statusF !== "all" && statusF !== col.key) continue;

        const colTasks = filtered.filter((t) => t.status === col.key);
        if (colTasks.length > 0) {
          result[col.key].push({
            projectName: state.project.name,
            projectPath: state.project.path,
            tasks: colTasks,
          });
        }
      }
    }

    return result;
  });

  // Drag state
  let dragTaskId: string | null = null;
  let dragProjectName: string | null = null;
  let dragProjectPath: string | null = null;

  const handleDragStart = (e: DragEvent, task: Task, projectName: string, projectPath: string) => {
    dragTaskId = task.id;
    dragProjectName = projectName;
    dragProjectPath = projectPath;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", task.id);
    }
    (e.currentTarget as HTMLElement).classList.add("kanban-card-dragging");
  };

  const handleDragEnd = (e: DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove("kanban-card-dragging");
    dragTaskId = null;
    dragProjectName = null;
    dragProjectPath = null;
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    (e.currentTarget as HTMLElement).classList.add("kanban-column-drag-over");
  };

  const handleDragLeave = (e: DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove("kanban-column-drag-over");
  };

  const handleDrop = (e: DragEvent, targetStatus: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove("kanban-column-drag-over");
    if (dragTaskId && dragProjectName && dragProjectPath) {
      updateTaskStatus(dragProjectName, dragProjectPath, dragTaskId, targetStatus);
    }
  };

  return (
    <div class="kanban-board">
      <For each={STATUS_COLUMNS}>
        {(col) => {
          const groups = createMemo(() => columnData()[col.key] || []);
          const taskCount = createMemo(() =>
            groups().reduce((sum, g) => sum + g.tasks.length, 0)
          );

          return (
            <Show when={statusFilter() === "all" || statusFilter() === col.key}>
              <div
                class="kanban-column"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div class="kanban-column-header">
                  <span class="kanban-column-dot" style={{ background: col.color }} />
                  <span class="kanban-column-title">{col.label}</span>
                  <span class="kanban-column-count">{taskCount()}</span>
                </div>
                <div class="kanban-column-body">
                  <For each={groups()}>
                    {(group) => (
                      <>
                        <Show when={projectList().length > 1}>
                          <div class="kanban-project-header">{group.projectName}</div>
                        </Show>
                        <For each={group.tasks}>
                          {(task) => (
                            <KanbanCard
                              task={task}
                              projectName={group.projectName}
                              projectPath={group.projectPath}
                              columnColor={col.color}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                            />
                          )}
                        </For>
                      </>
                    )}
                  </For>
                  <Show when={taskCount() === 0}>
                    <div class="kanban-empty">No tasks</div>
                  </Show>
                </div>
              </div>
            </Show>
          );
        }}
      </For>
    </div>
  );
}

function KanbanCard(props: {
  task: Task;
  projectName: string;
  projectPath: string;
  columnColor: string;
  onDragStart: (e: DragEvent, task: Task, projectName: string, projectPath: string) => void;
  onDragEnd: (e: DragEvent) => void;
}) {
  const isSelected = createMemo(() => {
    const sel = selectedTaskId();
    return sel?.project === props.projectName && sel?.taskId === props.task.id;
  });

  const isChecked = createMemo(() => selectedTasks().has(props.task.id));

  const allTasks = createMemo(() => getTaskTree(props.projectName));
  const parentTask = createMemo(() => {
    if (!props.task.parent) return null;
    return allTasks().find((t) => t.id === props.task.parent) || null;
  });

  const handleClick = () => {
    if (isSelected()) {
      setSelectedTaskId(null);
    } else {
      setSelectedTaskId({ project: props.projectName, taskId: props.task.id });
    }
  };

  const handleLaunch = (e: MouseEvent) => {
    e.stopPropagation();
    const prompt = `Limbo task ${props.task.id} — "${props.task.name}"${props.task.action ? `\nAction: ${props.task.action}` : ""}\n\nPick up this task from limbo and execute it. The task ID is ${props.task.id}.`;
    createPane(props.projectPath, { agent: "swe-team:project-manager", prompt });
    setViewMode("workspace");
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    deleteTask(props.projectName, props.projectPath, props.task.id);
  };

  const handleCheckbox = (e: MouseEvent) => {
    e.stopPropagation();
    toggleTaskSelection(props.task.id);
  };

  return (
    <div
      class={`kanban-card ${isSelected() ? "kanban-card-selected" : ""}`}
      draggable={true}
      onDragStart={(e) => props.onDragStart(e, props.task, props.projectName, props.projectPath)}
      onDragEnd={props.onDragEnd}
      onClick={handleClick}
    >
      <div class="kanban-card-top">
        <span
          class="kanban-card-checkbox"
          classList={{ "kanban-card-checkbox-checked": isChecked() }}
          onClick={handleCheckbox}
        />
        <span class="kanban-card-id">{props.task.id}</span>
        <Show when={props.task.parent}>
          <span class="kanban-card-parent" title={`Child of ${parentTask()?.name || props.task.parent}`}>
            {props.task.parent}
          </span>
        </Show>
        <span class="kanban-card-actions">
          <button class="kanban-card-action" onClick={handleDelete} title="Delete">&times;</button>
          <button class="kanban-card-action" onClick={handleLaunch} title="Launch">&#x25B6;</button>
        </span>
      </div>
      <div class="kanban-card-name">{props.task.name}</div>
      <Show when={props.task.owner}>
        <div class="kanban-card-owner">{props.task.owner}</div>
      </Show>
      <Show when={isSelected() && props.task.action}>
        <div class="kanban-card-detail">{props.task.action}</div>
      </Show>
    </div>
  );
}
