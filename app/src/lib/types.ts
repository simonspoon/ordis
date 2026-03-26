// Mirrors ordis-protocol Rust types

export interface SystemEvent {
  type: "system";
  subtype: string;
  session_id: string;
  model?: string;
  cwd?: string;
  tools?: string[];
}

export interface AssistantEvent {
  type: "assistant";
  message: AssistantMessage;
  session_id: string;
  parent_tool_use_id?: string | null;
}

export interface AssistantMessage {
  id: string;
  model: string;
  role: string;
  content: ContentBlock[];
  stop_reason: string | null;
  usage?: Usage;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean };

export interface StreamEvent {
  type: "stream_event";
  event: StreamInner;
  session_id: string;
  parent_tool_use_id?: string | null;
}

export type StreamInner =
  | { type: "message_start"; message: unknown }
  | { type: "content_block_start"; index: number; content_block: ContentBlockInfo }
  | { type: "content_block_delta"; index: number; delta: Delta }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: unknown; usage?: Usage }
  | { type: "message_stop" };

export type ContentBlockInfo =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input?: unknown };

export type Delta =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; thinking: string }
  | { type: "input_json_delta"; partial_json: string }
  | { type: "signature_delta"; signature: string };

export interface ResultEvent {
  type: "result";
  subtype: string;
  is_error: boolean;
  duration_ms: number;
  num_turns: number;
  result?: string;
  stop_reason?: string;
  session_id: string;
  total_cost_usd: number;
  usage?: ResultUsage;
}

export interface ResultUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface RateLimitEvent {
  type: "rate_limit_event";
  rate_limit_info: unknown;
  session_id: string;
}

export type ClaudeEvent =
  | SystemEvent
  | AssistantEvent
  | StreamEvent
  | ResultEvent
  | RateLimitEvent;

// App-level types

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  blocks: MessageBlock[];
  timestamp: number;
}

export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string; collapsed: boolean }
  | { type: "tool_use"; id: string; name: string; input: string; result?: string; isError?: boolean; collapsed: boolean };

export interface StreamingState {
  blocks: MessageBlock[];
  activeBlockIndex: number;
  toolInputBuffers: Map<number, string>;
}
