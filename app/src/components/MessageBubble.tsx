import { For, Show, createMemo } from "solid-js";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ChatMessage, MessageBlock } from "../lib/types";
import CodeBlock from "./CodeBlock";
import ThinkingBlock from "./ThinkingBlock";
import ToolBlock from "./ToolBlock";

interface Props {
  message: ChatMessage;
}

function renderMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

// Extract code blocks before markdown rendering so we can use shiki
interface ParsedSegment {
  type: "markdown" | "code";
  content: string;
  lang?: string;
}

function parseTextBlock(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const codeRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "markdown",
        content: text.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: "code",
      content: match[2],
      lang: match[1] || "text",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "markdown", content: text.slice(lastIndex) });
  }

  return segments;
}

function TextBlockRenderer(props: { text: string }) {
  const segments = createMemo(() => parseTextBlock(props.text));

  return (
    <For each={segments()}>
      {(seg) =>
        seg.type === "code" ? (
          <CodeBlock code={seg.content} lang={seg.lang!} />
        ) : (
          <div class="markdown-content" innerHTML={renderMarkdown(seg.content)} />
        )
      }
    </For>
  );
}

function BlockRenderer(props: { block: MessageBlock }) {
  return (
    <>
      <Show when={props.block.type === "text"}>
        <TextBlockRenderer text={(props.block as { text: string }).text} />
      </Show>
      <Show when={props.block.type === "thinking"}>
        <ThinkingBlock
          text={(props.block as { text: string }).text}
          collapsed={(props.block as { collapsed: boolean }).collapsed}
        />
      </Show>
      <Show when={props.block.type === "tool_use"}>
        {(() => {
          const b = props.block as {
            name: string;
            input: string;
            result?: string;
            isError?: boolean;
            collapsed: boolean;
          };
          return (
            <ToolBlock
              name={b.name}
              input={b.input}
              result={b.result}
              isError={b.isError}
              collapsed={b.collapsed}
            />
          );
        })()}
      </Show>
    </>
  );
}

export default function MessageBubble(props: Props) {
  const isUser = () => props.message.role === "user";

  return (
    <div class={`message ${isUser() ? "message-user" : "message-assistant"}`}>
      <Show when={isUser()}>
        <div class="message-role">You</div>
      </Show>
      <div class="message-body">
        <For each={props.message.blocks}>
          {(block) => <BlockRenderer block={block} />}
        </For>
      </div>
    </div>
  );
}
