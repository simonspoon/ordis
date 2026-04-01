import { onMount, onCleanup, For, Show, createMemo } from "solid-js";
import {
  loadProjects, toggleProject,
  getProjectList, getRootTasks, getChildTasks, getTaskCounts,
  setViewMode,
  updateTaskStatus, nextStatus, setupTaskListener,
  type Task,
} from "../lib/tasks";
import { createPane } from "../lib/store";

interface Props {
  visible: boolean;
}

export default function TaskSidebar(props: Props) {
  let unlisten: (() => void) | undefined;

  onMount(() => {
    loadProjects();
    setupTaskListener().then((fn) => { unlisten = fn; });
  });

  onCleanup(() => {
    unlisten?.();
  });

  const projectList = createMemo(() => getProjectList());

  return (
    <div class={`task-sidebar ${props.visible ? "" : "task-sidebar-hidden"}`}>
      <div class="sidebar-header">
        <span class="sidebar-title">Tasks</span>
        <button class="sidebar-refresh" onClick={() => loadProjects()} title="Refresh">
          &#x21bb;
        </button>
      </div>
      <div class="sidebar-content">
        <For each={projectList()}>
          {(state) => <SidebarProject state={state} />}
        </For>
      </div>
    </div>
  );
}

function SidebarProject(props: { state: ReturnType<typeof getProjectList>[0] }) {
  const counts = createMemo(() => getTaskCounts(props.state.project.name));
  const rootTasks = createMemo(() => getRootTasks(props.state.project.name));
  const total = createMemo(() => counts().todo + counts().inProgress);
  const expanded = () => props.state.expanded;

  return (
    <div class="sidebar-project">
      <div class="sidebar-project-header" onClick={() => toggleProject(props.state.project.name)}>
        <span class="sidebar-chevron">{expanded() ? "\u25BC" : "\u25B6"}</span>
        <span class="sidebar-project-name">{props.state.project.name}</span>
        <Show when={props.state.project.has_limbo && total() > 0}>
          <span class="sidebar-count">{total()}</span>
        </Show>
      </div>
      <Show when={expanded() && props.state.project.has_limbo}>
        <div class="sidebar-tasks">
          <Show when={props.state.loading}>
            <div class="sidebar-loading">...</div>
          </Show>
          <Show when={!props.state.loading && rootTasks().length === 0}>
            <div class="sidebar-empty">No tasks</div>
          </Show>
          <For each={rootTasks()}>
            {(task) => (
              <SidebarTask
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
  );
}

function SidebarTask(props: { task: Task; projectName: string; projectPath: string; depth: number }) {
  const children = createMemo(() => getChildTasks(props.projectName, props.task.id));

  const statusDot = () => {
    switch (props.task.status) {
      case "in-progress": return "status-dot-in-progress";
      case "done": return "status-dot-done";
      default: return "status-dot-todo";
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

  return (
    <>
      <div
        class="sidebar-task"
        style={{ "padding-left": `${8 + props.depth * 12}px` }}
        title={props.task.action || props.task.name}
      >
        <span
          class={`status-dot status-dot-clickable ${statusDot()}`}
          onClick={handleStatusCycle}
          title="Click to cycle status"
        />
        <span class="sidebar-task-id">{props.task.id}</span>
        <span class="sidebar-task-name">{props.task.name}</span>
        <button class="sidebar-task-launch" onClick={handleLaunch}>&#x25B6;</button>
      </div>
      <For each={children()}>
        {(child) => (
          <SidebarTask
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
