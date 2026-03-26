import { For, Show, onMount, createEffect } from "solid-js";
import { messages, streamingMessage } from "../lib/store";
import MessageBubble from "./MessageBubble";

export default function ChatView() {
  let scrollRef: HTMLDivElement | undefined;

  const scrollToBottom = () => {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
    }
  };

  // Auto-scroll when messages change
  createEffect(() => {
    messages();
    streamingMessage();
    scrollToBottom();
  });

  onMount(scrollToBottom);

  return (
    <div class="chat-view" ref={scrollRef}>
      <For each={messages()}>
        {(msg) => <MessageBubble message={msg} />}
      </For>
      <Show when={streamingMessage()}>
        <MessageBubble message={streamingMessage()!} />
      </Show>
    </div>
  );
}
