import { createSignal, Show } from "solid-js";

interface Props {
  name: string;
  input: string;
  result?: string;
  isError?: boolean;
  collapsed: boolean;
}

const TOOL_COLORS: Record<string, string> = {
  Bash: "#4ec9b0",
  Edit: "#e0a84e",
  Write: "#e0a84e",
  Read: "#569cd6",
  Glob: "#569cd6",
  Grep: "#569cd6",
  Agent: "#c586c0",
};

export default function ToolBlock(props: Props) {
  const [open, setOpen] = createSignal(!props.collapsed);
  const color = () => TOOL_COLORS[props.name] || "#9cdcfe";

  return (
    <div class="tool-block" style={{ "border-left-color": color() }}>
      <button class="tool-toggle" onClick={() => setOpen(!open())}>
        <span class="tool-icon">{open() ? "▼" : "▶"}</span>
        <span class="tool-name" style={{ color: color() }}>{props.name}</span>
        <Show when={props.isError}>
          <span class="tool-error-badge">error</span>
        </Show>
      </button>
      {open() && (
        <div class="tool-content">
          <Show when={props.input}>
            <div class="tool-section">
              <div class="tool-section-label">Input</div>
              <pre class="tool-pre">{props.input}</pre>
            </div>
          </Show>
          <Show when={props.result}>
            <div class="tool-section">
              <div class="tool-section-label">Result</div>
              <pre class={`tool-pre ${props.isError ? "tool-error" : ""}`}>
                {props.result}
              </pre>
            </div>
          </Show>
        </div>
      )}
    </div>
  );
}
