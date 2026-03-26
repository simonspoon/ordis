import { createSignal } from "solid-js";
import type {
  ChatMessage,
  MessageBlock,
  ClaudeEvent,
  StreamingState,
} from "./types";

export type AppStatus = "idle" | "streaming" | "error";

// Signals
export const [messages, setMessages] = createSignal<ChatMessage[]>([]);
export const [status, setStatus] = createSignal<AppStatus>("idle");
export const [model, setModel] = createSignal<string>("");
export const [totalCost, setTotalCost] = createSignal(0);
export const [inputTokens, setInputTokens] = createSignal(0);
export const [outputTokens, setOutputTokens] = createSignal(0);
export const [sessionId, setSessionId] = createSignal<string | null>(null);
export const [skipPermissions, setSkipPermissions] = createSignal(false);
export const [cwd, setCwd] = createSignal("");

// Streaming accumulator
let streaming: StreamingState | null = null;

function ensureStreaming(): StreamingState {
  if (!streaming) {
    streaming = {
      blocks: [],
      activeBlockIndex: -1,
      toolInputBuffers: new Map(),
    };
  }
  return streaming;
}

export function addUserMessage(text: string) {
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    blocks: [{ type: "text", text }],
    timestamp: Date.now(),
  };
  setMessages((prev) => [...prev, msg]);
}

export function handleClaudeEvent(event: ClaudeEvent) {
  switch (event.type) {
    case "system": {
      if (event.subtype === "init" && event.model) {
        setModel(event.model);
      }
      break;
    }

    case "stream_event": {
      const inner = event.event;
      const s = ensureStreaming();

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
          emitStreamingMessage();
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
          emitStreamingMessage();
          break;
        }

        case "content_block_stop": {
          const block = s.blocks[inner.index];
          if (block?.type === "thinking") {
            block.collapsed = true;
          }
          if (block?.type === "tool_use") {
            // Try to pretty-print the input JSON
            try {
              const parsed = JSON.parse(block.input);
              block.input = JSON.stringify(parsed, null, 2);
            } catch {
              // leave as-is
            }
          }
          emitStreamingMessage();
          break;
        }

        case "message_stop": {
          // Finalize the streaming message
          if (s.blocks.length > 0) {
            const msg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              blocks: [...s.blocks],
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, msg]);
          }
          streaming = null;
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

    case "user": {
      if (event.message.content) {
        for (const block of event.message.content) {
          if (block.type === "tool_result") {
            attachToolResult(
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
      setTotalCost((prev) => prev + event.total_cost_usd);
      if (event.usage) {
        setInputTokens((prev) => prev + event.usage!.input_tokens);
        setOutputTokens((prev) => prev + event.usage!.output_tokens);
      }
      setSessionId(event.session_id);
      setStatus("idle");
      // Clean up any lingering streaming state
      streaming = null;
      break;
    }
  }
}

function attachToolResult(toolUseId: string, content: string, isError: boolean) {
  // Check streaming blocks first
  if (streaming) {
    for (const block of streaming.blocks) {
      if (block.type === "tool_use" && block.id === toolUseId) {
        block.result = content;
        block.isError = isError;
        emitStreamingMessage();
        return;
      }
    }
  }
  // Check finalized messages
  setMessages((prev) =>
    prev.map((msg) => ({
      ...msg,
      blocks: msg.blocks.map((block) =>
        block.type === "tool_use" && block.id === toolUseId
          ? { ...block, result: content, isError: isError }
          : block,
      ),
    })),
  );
}

// Emit a snapshot of the current streaming state as a temporary message
// We use a special signal for this
export const [streamingMessage, setStreamingMessage] = createSignal<ChatMessage | null>(null);

function emitStreamingMessage() {
  if (!streaming || streaming.blocks.length === 0) {
    setStreamingMessage(null);
    return;
  }
  setStreamingMessage({
    id: "streaming",
    role: "assistant",
    blocks: [...streaming.blocks],
    timestamp: Date.now(),
  });
}

export function resetSession() {
  setMessages([]);
  setTotalCost(0);
  setInputTokens(0);
  setOutputTokens(0);
  setSessionId(null);
  setStreamingMessage(null);
  streaming = null;
}
