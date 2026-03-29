import { createStore, produce } from "solid-js/store";

// --- Types ---

export type ToastType = "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

// --- State ---

export const [toasts, setToasts] = createStore<Toast[]>([]);

// --- Auto-dismiss durations (ms) ---

const DURATIONS: Record<ToastType, number | null> = {
  info: 3000,
  warning: 5000,
  error: null, // manual dismiss only
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

// --- Actions ---

export function addToast(message: string, type: ToastType = "info"): string {
  const id = crypto.randomUUID();
  setToasts(produce((t) => t.push({ id, message, type })));

  const duration = DURATIONS[type];
  if (duration !== null) {
    const timer = setTimeout(() => removeToast(id), duration);
    timers.set(id, timer);
  }

  return id;
}

export function removeToast(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  setToasts(produce((t) => {
    const idx = t.findIndex((toast) => toast.id === id);
    if (idx !== -1) t.splice(idx, 1);
  }));
}

// --- Convenience ---

export const toast = {
  error: (msg: string) => addToast(msg, "error"),
  warning: (msg: string) => addToast(msg, "warning"),
  info: (msg: string) => addToast(msg, "info"),
};
