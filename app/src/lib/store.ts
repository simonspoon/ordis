import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type {
  ChatMessage,
  MessageBlock,
  ClaudeEvent,
  StreamingState,
  PaneState,
  PendingQuestion,
} from "./types";

export type AppStatus = "idle" | "streaming" | "error";

// Global state (shared across all panes)
export const [cwd, setCwd] = createSignal("");

// Pane state
export const [panes, setPanes] = createStore<Record<string, PaneState>>({});
export const [activePaneId, setActivePaneId] = createSignal<string>("");
export const [paneOrder, setPaneOrder] = createSignal<string[]>([]);

// Per-pane streaming accumulators (not in store — mutable working state)
const streamingStates = new Map<string, StreamingState>();

function ensureStreaming(paneId: string): StreamingState {
  let s = streamingStates.get(paneId);
  if (!s) {
    s = { blocks: [], activeBlockIndex: -1, toolInputBuffers: new Map() };
    streamingStates.set(paneId, s);
  }
  return s;
}

export function createPane(): string {
  const id = crypto.randomUUID();
  setPanes(id, {
    id,
    messages: [],
    status: "idle",
    model: "",
    totalCost: 0,
    inputTokens: 0,
    outputTokens: 0,
    sessionId: null,
    streamingMessage: null,
    pendingQuestions: [],
  });
  setPaneOrder((prev) => [...prev, id]);
  setActivePaneId(id);
  return id;
}

export function closePane(paneId: string) {
  setPanes(produce((p) => { delete p[paneId]; }));
  streamingStates.delete(paneId);
  setPaneOrder((prev) => prev.filter((id) => id !== paneId));
  if (activePaneId() === paneId) {
    const remaining = paneOrder();
    setActivePaneId(remaining.length > 0 ? remaining[0] : "");
  }
}

export function addUserMessage(paneId: string, text: string) {
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    blocks: [{ type: "text", text }],
    timestamp: Date.now(),
  };
  setPanes(paneId, "messages", (prev) => [...prev, msg]);
}

export function handleClaudeEvent(paneId: string, event: ClaudeEvent) {
  if (!panes[paneId]) return;

  switch (event.type) {
    case "system": {
      if (event.subtype === "init" && event.model) {
        setPanes(paneId, "model", event.model);
      }
      break;
    }

    case "stream_event": {
      const inner = event.event;
      const s = ensureStreaming(paneId);

      switch (inner.type) {
        case "content_block_start": {
          const cb = inner.content_block;
          let block: MessageBlock;
          if (cb.type === "text") {
            block = { type: "text", text: cb.text };
          } else if (cb.type === "thinking") {
            block = { type: "thinking", text: cb.thinking, collapsed: false };
          } else {
            block = {
              type: "tool_use",
              id: cb.id,
              name: cb.name,
              input: "",
              collapsed: false,
            };
            s.toolInputBuffers.set(inner.index, "");
          }
          s.blocks[inner.index] = block;
          s.activeBlockIndex = inner.index;
          emitStreamingMessage(paneId);
          break;
        }

        case "content_block_delta": {
          const block = s.blocks[inner.index];
          if (!block) break;

          const delta = inner.delta;
          if (delta.type === "text_delta" && block.type === "text") {
            block.text += delta.text;
          } else if (delta.type === "thinking_delta" && block.type === "thinking") {
            block.text += delta.thinking;
          } else if (delta.type === "input_json_delta" && block.type === "tool_use") {
            const buf = (s.toolInputBuffers.get(inner.index) || "") + delta.partial_json;
            s.toolInputBuffers.set(inner.index, buf);
            block.input = buf;
          }
          emitStreamingMessage(paneId);
          break;
        }

        case "content_block_stop": {
          const block = s.blocks[inner.index];
          if (block?.type === "thinking") {
            block.collapsed = true;
          }
          if (block?.type === "tool_use") {
            try {
              const parsed = JSON.parse(block.input);
              block.input = JSON.stringify(parsed, null, 2);
            } catch {
              // leave as-is
            }
          }
          emitStreamingMessage(paneId);
          break;
        }

        case "message_stop": {
          if (s.blocks.length > 0) {
            // Deep-clone blocks so SolidJS store sees fresh objects
            const blocks: MessageBlock[] = s.blocks.map((b) => ({ ...b }));
            const msg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              blocks,
              timestamp: Date.now(),
            };
            setPanes(paneId, "messages", (prev) => [...prev, msg]);
          }
          streamingStates.delete(paneId);
          setPanes(paneId, "streamingMessage", null);
          break;
        }
      }
      break;
    }

    case "assistant": {
      if (event.message.content) {
        for (const block of event.message.content) {
          if (block.type === "tool_result") {
            attachToolResult(
              paneId,
              block.tool_use_id,
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content, null, 2),
              block.is_error || false,
            );
          } else if (block.type === "tool_use" && block.name === "AskUserQuestion") {
            extractPendingQuestions(paneId, block.id, block.input);
          }
        }
      }
      break;
    }

    case "user": {
      if (event.message.content) {
        for (const block of event.message.content) {
          if (block.type === "tool_result") {
            attachToolResult(
              paneId,
              block.tool_use_id,
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content, null, 2),
              block.is_error || false,
            );
          }
        }
      }
      break;
    }

    case "result": {
      setPanes(paneId, "totalCost", (prev) => prev + event.total_cost_usd);
      if (event.usage) {
        setPanes(paneId, "inputTokens", (prev) => prev + event.usage!.input_tokens);
        setPanes(paneId, "outputTokens", (prev) => prev + event.usage!.output_tokens);
      }
      setPanes(paneId, "sessionId", event.session_id);
      setPanes(paneId, "status", "idle");
      streamingStates.delete(paneId);
      break;
    }
  }
}

function extractPendingQuestions(paneId: string, toolUseId: string, input: unknown) {
  try {
    const data = input as { questions?: Array<{
      question: string;
      header?: string;
      options?: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    }> };
    if (!data?.questions?.length) return;
    const questions: PendingQuestion[] = data.questions.map((q) => ({
      toolUseId,
      question: q.question,
      header: q.header,
      options: q.options || [],
      multiSelect: q.multiSelect || false,
    }));
    setPanes(paneId, "pendingQuestions", (prev) => [...prev, ...questions]);
  } catch {
    // Malformed input — ignore
  }
}

export function clearPendingQuestions(paneId: string) {
  setPanes(paneId, "pendingQuestions", []);
}

function attachToolResult(paneId: string, toolUseId: string, content: string, isError: boolean) {
  const s = streamingStates.get(paneId);
  if (s) {
    for (const block of s.blocks) {
      if (block.type === "tool_use" && block.id === toolUseId) {
        block.result = content;
        block.isError = isError;
        emitStreamingMessage(paneId);
        return;
      }
    }
  }
  setPanes(paneId, "messages", (msgs) =>
    msgs.map((msg) => ({
      ...msg,
      blocks: msg.blocks.map((block) =>
        block.type === "tool_use" && block.id === toolUseId
          ? { ...block, result: content, isError }
          : block,
      ),
    })),
  );
}

function emitStreamingMessage(paneId: string) {
  const s = streamingStates.get(paneId);
  if (!s || s.blocks.length === 0) {
    setPanes(paneId, "streamingMessage", null);
    return;
  }
  setPanes(paneId, "streamingMessage", {
    id: "streaming",
    role: "assistant",
    blocks: [...s.blocks],
    timestamp: Date.now(),
  });
}

export function resetPane(paneId: string) {
  setPanes(paneId, {
    messages: [],
    status: "idle" as AppStatus,
    model: panes[paneId]?.model || "",
    totalCost: 0,
    inputTokens: 0,
    outputTokens: 0,
    sessionId: null,
    streamingMessage: null,
    pendingQuestions: [],
  });
  streamingStates.delete(paneId);
}
