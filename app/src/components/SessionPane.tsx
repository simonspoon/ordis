import { invoke } from "@tauri-apps/api/core";
import { panes, clearPendingQuestions, addUserMessage, setPanes } from "../lib/store";
import type { PendingQuestion } from "../lib/types";
import ChatView from "./ChatView";
import InputArea from "./InputArea";
import ApprovalBar from "./ApprovalBar";
import StatusBar from "./StatusBar";

interface Props {
  paneId: string;
}

export default function SessionPane(props: Props) {
  const pane = () => panes[props.paneId];

  const handleAnswerQuestion = async (question: PendingQuestion, answer: string) => {
    clearPendingQuestions(props.paneId);
    const msg = `The answer to "${question.question}" is: ${answer}`;
    addUserMessage(props.paneId, msg);
    setPanes(props.paneId, "status", "streaming");
    try {
      await invoke("send_message", { paneId: props.paneId, message: msg });
    } catch (e) {
      console.error("Failed to send answer:", e);
      setPanes(props.paneId, "status", "error");
    }
  };

  const handleDismissQuestions = () => {
    clearPendingQuestions(props.paneId);
  };

  return (
    <div class="session-pane">
      <ChatView
        messages={pane()?.messages ?? []}
        streamingMessage={pane()?.streamingMessage ?? null}
      />
      <ApprovalBar
        pendingQuestions={pane()?.pendingQuestions ?? []}
        onAnswerQuestion={handleAnswerQuestion}
        onDismissQuestions={handleDismissQuestions}
      />
      <InputArea
        paneId={props.paneId}
        status={pane()?.status ?? "idle"}
      />
      <StatusBar
        model={pane()?.model ?? ""}
        totalCost={pane()?.totalCost ?? 0}
        inputTokens={pane()?.inputTokens ?? 0}
        outputTokens={pane()?.outputTokens ?? 0}
        status={pane()?.status ?? "idle"}
        sessionId={pane()?.sessionId ?? null}
      />
    </div>
  );
}
