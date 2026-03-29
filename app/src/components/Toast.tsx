import { For } from "solid-js";
import { toasts, removeToast, type ToastType } from "../lib/toast";

const TYPE_CLASSES: Record<ToastType, string> = {
  error: "toast-error",
  warning: "toast-warning",
  info: "toast-info",
};

export default function ToastContainer() {
  return (
    <div class="toast-container">
      <For each={toasts}>
        {(t) => (
          <div class={`toast ${TYPE_CLASSES[t.type]}`}>
            <span class="toast-message">{t.message}</span>
            <button class="toast-dismiss" onClick={() => removeToast(t.id)}>
              &times;
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
