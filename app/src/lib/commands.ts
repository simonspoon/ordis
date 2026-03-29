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

const registry: Command[] = [];

// --- Actions ---

export function registerCommand(cmd: Command) {
  // Replace if same ID already exists
  const idx = registry.findIndex((c) => c.id === cmd.id);
  if (idx !== -1) {
    registry[idx] = cmd;
  } else {
    registry.push(cmd);
  }
}

export function getCommands(): Command[] {
  return [...registry];
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
