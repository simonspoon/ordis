import { createSignal } from "solid-js";

interface Props {
  text: string;
  collapsed: boolean;
}

export default function ThinkingBlock(props: Props) {
  const [open, setOpen] = createSignal(!props.collapsed);

  return (
    <div class="thinking-block">
      <button class="thinking-toggle" onClick={() => setOpen(!open())}>
        <span class="thinking-icon">{open() ? "▼" : "▶"}</span>
        <span class="thinking-label">Thinking</span>
      </button>
      {open() && <div class="thinking-content">{props.text}</div>}
    </div>
  );
}
