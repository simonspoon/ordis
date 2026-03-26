import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { addUserMessage, setPanes, clearPendingQuestions } from "../lib/store";
import type { AppStatus } from "../lib/store";

interface Props {
  paneId: string;
  status: AppStatus;
}

export default function InputArea(props: Props) {
  const [text, setText] = createSignal("");

  const send = async () => {
    const msg = text().trim();
    if (!msg || props.status === "streaming") return;

    clearPendingQuestions(props.paneId);
    addUserMessage(props.paneId, msg);
    setText("");
    setPanes(props.paneId, "status", "streaming");

    try {
      await invoke("send_message", { paneId: props.paneId, message: msg });
    } catch (e) {
      console.error("Failed to send message:", e);
      setPanes(props.paneId, "status", "error");
    }
  };

  const stop = async () => {
    try {
      await invoke("stop_generation", { paneId: props.paneId });
      setPanes(props.paneId, "status", "idle");
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
        disabled={props.status === "streaming"}
        rows={1}
      />
      {props.status === "streaming" ? (
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
