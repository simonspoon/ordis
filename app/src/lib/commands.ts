import { createSignal } from "solid-js";

// --- Types ---

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

// --- State ---

export const [paletteOpen, setPaletteOpen] = createSignal(false);

const [commands, setCommands] = createSignal<Command[]>([]);

// --- Actions ---

export function registerCommand(cmd: Command) {
  setCommands((prev) => {
    const idx = prev.findIndex((c) => c.id === cmd.id);
    if (idx !== -1) {
      const next = [...prev];
      next[idx] = cmd;
      return next;
    }
    return [...prev, cmd];
  });
}

export function getCommands(): Command[] {
  return commands();
}

export function togglePalette() {
  setPaletteOpen((v) => !v);
}

export function closePalette() {
  setPaletteOpen(false);
}

// --- Fuzzy Match ---

export function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // Simple substring match — fast and good enough for a command palette
  return t.includes(q);
}

export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // Exact prefix match gets highest score
  if (t.startsWith(q)) return 2;
  // Contains match gets lower score
  if (t.includes(q)) return 1;
  return 0;
}
