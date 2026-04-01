import { For } from "solid-js";
import {
  getSidebarPlugins,
  getActiveSidebar,
  toggleSessionPlugin,
} from "../lib/plugins";

export default function ActivityBar() {
  return (
    <div class="activity-bar">
      <For each={getSidebarPlugins()}>
        {(plugin) => {
          const isActive = () => getActiveSidebar() === plugin.manifest.id;
          return (
            <button
              class={`activity-bar-icon ${isActive() ? "activity-bar-icon-active" : ""}`}
              title={plugin.manifest.name}
              onClick={() => toggleSessionPlugin(plugin.manifest.id)}
            >
              {plugin.manifest.icon}
            </button>
          );
        }}
      </For>
    </div>
  );
}
