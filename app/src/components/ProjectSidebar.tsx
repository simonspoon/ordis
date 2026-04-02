import { onMount, onCleanup, For, Show, createMemo } from "solid-js";
import {
  loadProjects,
  getProjectList, getTaskCounts,
  activeProject, setActiveProject,
  setViewMode,
  setupTaskListener,
} from "../lib/tasks";
import { createPane } from "../lib/store";

export default function ProjectSidebar() {
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
    <div class="project-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Projects</span>
        <button class="sidebar-refresh" onClick={() => loadProjects()} title="Refresh">
          &#x21bb;
        </button>
      </div>
      <div class="sidebar-content">
        <For each={projectList()}>
          {(state) => {
            const counts = createMemo(() => getTaskCounts(state.project.name));
            const total = createMemo(() => counts().todo + counts().inProgress + counts().done);
            const isActive = createMemo(() => activeProject() === state.project.name);

            const handleSelect = () => {
              setActiveProject(state.project.name);
            };

            const handleStartSession = (e: MouseEvent) => {
              e.stopPropagation();
              createPane(state.project.path);
              setViewMode("sessions");
            };

            return (
              <div
                class={`project-sidebar-item ${isActive() ? "project-sidebar-item-active" : ""}`}
                onClick={handleSelect}
              >
                <div class="project-sidebar-item-info">
                  <span class="project-sidebar-item-name">{state.project.name}</span>
                  <Show when={state.project.has_limbo && total() > 0}>
                    <span class="project-sidebar-item-count">{total()}</span>
                  </Show>
                  <Show when={!state.project.has_limbo}>
                    <span class="project-sidebar-item-nolimbo">no limbo</span>
                  </Show>
                </div>
                <button
                  class="project-sidebar-session-btn"
                  onClick={handleStartSession}
                  title="Start session"
                >
                  &#x25B6;
                </button>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
