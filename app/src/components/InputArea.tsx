import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { status, setStatus, addUserMessage } from "../lib/store";

export default function InputArea() {
  const [text, setText] = createSignal("");

  const send = async () => {
    const msg = text().trim();
    if (!msg || status() === "streaming") return;

    addUserMessage(msg);
    setText("");
    setStatus("streaming");

    try {
      await invoke("send_message", { message: msg });
    } catch (e) {
      console.error("Failed to send message:", e);
      setStatus("error");
    }
  };

  const stop = async () => {
    try {
      await invoke("stop_generation");
      setStatus("idle");
    } catch (e) {
      console.error("Failed to stop:", e);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div class="input-area">
      <textarea
        class="input-textarea"
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Send a message..."
        disabled={status() === "streaming"}
        rows={1}
      />
      {status() === "streaming" ? (
        <button class="btn btn-stop" onClick={stop}>
          Stop
        </button>
      ) : (
        <button
          class="btn btn-send"
          onClick={send}
          disabled={!text().trim()}
        >
          Send
        </button>
      )}
    </div>
  );
}
