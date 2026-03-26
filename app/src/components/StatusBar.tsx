import { model, totalCost, inputTokens, outputTokens, status, sessionId } from "../lib/store";

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export default function StatusBar() {
  return (
    <div class="status-bar">
      <span class="status-model">{model() || "..."}</span>
      <span class="status-sep">|</span>
      <span class="status-cost">{formatCost(totalCost())}</span>
      <span class="status-sep">|</span>
      <span class="status-tokens">
        {formatTokens(inputTokens())} in / {formatTokens(outputTokens())} out
      </span>
      <span class="status-indicator">
        {status() === "streaming" ? "..." : ""}
      </span>
      {sessionId() && (
        <span class="status-session" title={sessionId()!}>
          session: {sessionId()!.slice(0, 8)}
        </span>
      )}
    </div>
  );
}
