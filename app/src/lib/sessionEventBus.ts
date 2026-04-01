import { parseToolOutput } from "./artifactParser";
import { stripAnsi } from "./artifactParser";

// --- Event Types ---

export type SessionEvent =
  | { type: "file_written"; path: string; operation: "created" | "edited" | "screenshot" }
  | { type: "file_read"; path: string }
  | { type: "command_run"; command: string; exitCode: number | null }
  | { type: "message"; role: "user" | "assistant"; text: string }
  | { type: "status"; status: "idle" | "thinking" | "tool_use" }
  | { type: "cwd"; path: string }
  | { type: "raw"; data: string };

export type SessionEventType = SessionEvent["type"];

export type SessionEventHandler<T extends SessionEventType> = (
  event: Extract<SessionEvent, { type: T }>,
) => void;

export type WildcardHandler = (event: SessionEvent) => void;

// --- Event Bus ---

export class SessionEventBus {
  private handlers = new Map<string, Set<Function>>();
  private wildcardHandlers = new Set<WildcardHandler>();
  private lineBuf = "";
  private decoder = new TextDecoder();

  /** Feed raw PTY data. Parses lines and emits structured events. */
  feed(data: Uint8Array): void {
    const text = this.decoder.decode(new Uint8Array(data)).replace(/\r/g, "");
    this.lineBuf += text;
    const lines = this.lineBuf.split("\n");
    this.lineBuf = lines.pop() || "";

    this.emit({ type: "raw", data: text });

    for (const line of lines) {
      this.parseLine(line);
    }
  }

  /** Subscribe to a specific event type. Returns unsubscribe function. */
  on<T extends SessionEventType>(
    type: T,
    handler: SessionEventHandler<T>,
  ): () => void;
  on(type: "*", handler: WildcardHandler): () => void;
  on(type: string, handler: Function): () => void {
    if (type === "*") {
      this.wildcardHandlers.add(handler as WildcardHandler);
      return () => this.wildcardHandlers.delete(handler as WildcardHandler);
    }
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  /** Emit an event (also usable externally for synthetic events like cwd changes). */
  emit(event: SessionEvent): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) for (const h of handlers) h(event);
    for (const h of this.wildcardHandlers) h(event);
  }

  /** Clear all subscriptions and buffers. */
  destroy(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
    this.lineBuf = "";
  }

  private parseLine(line: string): void {
    const parsed = parseToolOutput(line);
    if (parsed) {
      const { filePath, operation } = parsed;
      if (
        operation === "created" ||
        operation === "edited" ||
        operation === "screenshot"
      ) {
        this.emit({ type: "file_written", path: filePath, operation });
      } else if (operation === "read") {
        this.emit({ type: "file_read", path: filePath });
      }
    }

    const clean = stripAnsi(line).trim();
    if (/^⏳|^Thinking/i.test(clean)) {
      this.emit({ type: "status", status: "thinking" });
    } else if (/^⚡|^Running|^Executing/i.test(clean)) {
      this.emit({ type: "status", status: "tool_use" });
    }

    const cmdMatch = clean.match(/^⏺\s+Bash\s*\((.*?)\)\s*$/);
    if (cmdMatch) {
      this.emit({ type: "command_run", command: cmdMatch[1], exitCode: null });
    }
    const exitMatch = clean.match(/Exit code:\s*(\d+)/);
    if (exitMatch) {
      this.emit({
        type: "command_run",
        command: "",
        exitCode: parseInt(exitMatch[1]),
      });
    }
  }
}

// --- Factory ---

export function createSessionEventBus(): SessionEventBus {
  return new SessionEventBus();
}
