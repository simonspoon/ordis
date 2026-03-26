import type { AppStatus } from "../lib/store";

interface Props {
  model: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  status: AppStatus;
  sessionId: string | null;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export default function StatusBar(props: Props) {
  return (
    <div class="status-bar">
      <span class="status-model">{props.model || "..."}</span>
      <span class="status-sep">|</span>
      <span class="status-cost">{formatCost(props.totalCost)}</span>
      <span class="status-sep">|</span>
      <span class="status-tokens">
        {formatTokens(props.inputTokens)} in / {formatTokens(props.outputTokens)} out
      </span>
      <span class="status-indicator">
        {props.status === "streaming" ? "..." : ""}
      </span>
      {props.sessionId && (
        <span class="status-session" title={props.sessionId}>
          session: {props.sessionId.slice(0, 8)}
        </span>
      )}
    </div>
  );
}
