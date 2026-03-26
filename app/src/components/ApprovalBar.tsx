import { For, Show } from "solid-js";
import type { PendingQuestion } from "../lib/types";

interface Props {
  pendingQuestions: PendingQuestion[];
  onAnswerQuestion: (question: PendingQuestion, answer: string) => void;
  onDismissQuestions: () => void;
}

export default function ApprovalBar(props: Props) {
  return (
    <Show when={props.pendingQuestions.length > 0}>
      <div class="approval-bar">
        <For each={props.pendingQuestions}>
          {(q) => (
            <div class="approval-question">
              <Show when={q.header}>
                <div class="approval-header">{q.header}</div>
              </Show>
              <div class="approval-text">{q.question}</div>
              <Show when={q.options.length > 0}>
                <div class="approval-options">
                  <For each={q.options}>
                    {(opt) => (
                      <button
                        class="btn btn-option"
                        onClick={() => props.onAnswerQuestion(q, opt.label)}
                        title={opt.description || opt.label}
                      >
                        {opt.label}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={q.options.length === 0}>
                <div class="approval-hint">Type your answer below and send</div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
