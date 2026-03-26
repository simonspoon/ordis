import { For, Show, createEffect } from "solid-js";
import type { ChatMessage } from "../lib/types";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: ChatMessage[];
  streamingMessage: ChatMessage | null;
}

export default function ChatView(props: Props) {
  let scrollRef: HTMLDivElement | undefined;

  const scrollToBottom = () => {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
    }
  };

  createEffect(() => {
    props.messages;
    props.streamingMessage;
    scrollToBottom();
  });

  return (
    <div class="chat-view" ref={scrollRef}>
      <For each={props.messages}>
        {(msg) => <MessageBubble message={msg} />}
      </For>
      <Show when={props.streamingMessage}>
        <MessageBubble message={props.streamingMessage!} />
      </Show>
    </div>
  );
}
