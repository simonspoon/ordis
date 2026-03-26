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

/** For Bash, extract a short summary from the input JSON */
function bashSummary(input: string): string | null {
  try {
    const parsed = JSON.parse(input);
    return parsed.command || parsed.description || null;
  } catch {
    return input.split("\n")[0].slice(0, 80) || null;
  }
}

export default function ToolBlock(props: Props) {
  const [inputOpen, setInputOpen] = createSignal(!props.collapsed);
  const [resultOpen, setResultOpen] = createSignal(false);
  const color = () => TOOL_COLORS[props.name] || "#9cdcfe";
  const summary = () => props.name === "Bash" ? bashSummary(props.input) : null;

  return (
    <div class="tool-block" style={{ "border-left-color": color() }}>
      <button class="tool-toggle" onClick={() => setInputOpen(!inputOpen())}>
        <span class="tool-icon">{inputOpen() ? "▼" : "▶"}</span>
        <span class="tool-name" style={{ color: color() }}>{props.name}</span>
        <Show when={summary() && !inputOpen()}>
          <span class="tool-summary">{summary()}</span>
        </Show>
        <Show when={props.isError}>
          <span class="tool-error-badge">error</span>
        </Show>
      </button>
      {inputOpen() && (
        <div class="tool-content">
          <Show when={props.input}>
            <div class="tool-section">
              <div class="tool-section-label">Input</div>
              <pre class="tool-pre">{props.input}</pre>
            </div>
          </Show>
        </div>
      )}
      <Show when={props.result}>
        <button class="tool-result-toggle" onClick={() => setResultOpen(!resultOpen())}>
          <span class="tool-icon">{resultOpen() ? "▼" : "▶"}</span>
          <span class="tool-section-label" style={{ margin: "0" }}>
            Output
          </span>
          <Show when={props.isError}>
            <span class="tool-error-badge">error</span>
          </Show>
        </button>
        {resultOpen() && (
          <div class="tool-content">
            <pre class={`tool-pre ${props.isError ? "tool-error" : ""}`}>
              {props.result}
            </pre>
          </div>
        )}
      </Show>
    </div>
  );
}
