import { panes } from "../lib/store";
import ChatView from "./ChatView";
import InputArea from "./InputArea";
import StatusBar from "./StatusBar";

interface Props {
  paneId: string;
}

export default function SessionPane(props: Props) {
  const pane = () => panes[props.paneId];

  return (
    <div class="session-pane">
      <ChatView
        messages={pane()?.messages ?? []}
        streamingMessage={pane()?.streamingMessage ?? null}
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
