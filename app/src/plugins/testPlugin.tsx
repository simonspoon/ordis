import { createSignal } from "solid-js";
import type { Component } from "solid-js";
import {
  registerSessionPlugin,
  registerWorkspacePlugin,
  registerPluginCommand,
} from "../lib/plugins";
import type { WorkspacePluginProps } from "../lib/plugins";
import { toast } from "../lib/toast";

const TestSidebar: Component<{ visible: boolean }> = (props) => {
  const [count, setCount] = createSignal(0);
  return (
    <div style={{ display: props.visible ? "block" : "none", padding: "12px" }}>
      <p>Test Sidebar</p>
      <button onClick={() => setCount((c) => c + 1)}>Count: {count()}</button>
    </div>
  );
};

const TestWorkspace: Component<WorkspacePluginProps> = (props) => {
  return (
    <div style={{ padding: "12px" }}>
      <h2>Test Workspace</h2>
      <p>Verification plugin for the workspace slot.</p>
      <p>Active sessions: {props.sessions.length}</p>
      <p>Active pane: {props.activePaneId || "none"}</p>
    </div>
  );
};

export function init() {
  registerSessionPlugin(
    { id: "test-sidebar", name: "Test Sidebar", icon: "\u{1F9EA}", type: "sidebar", defaultSide: "right" },
    TestSidebar,
  );

  registerWorkspacePlugin(
    { id: "test-workspace", name: "Test Workspace", icon: "\u{1F52C}", type: "workspace" },
    TestWorkspace,
  );

  registerPluginCommand("test-sidebar", "Say Hello", () =>
    toast.info("Hello from plugin!"),
  );
}
