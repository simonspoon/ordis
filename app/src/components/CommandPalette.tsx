import { createSignal, createMemo, onMount, onCleanup, For, Show } from "solid-js";
import {
  paletteOpen, closePalette,
  getCommands, fuzzyMatch, fuzzyScore,
  type Command,
} from "../lib/commands";

export default function CommandPalette() {
  let inputRef!: HTMLInputElement;
  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const filtered = createMemo(() => {
    const q = query();
    const cmds = getCommands();
    if (!q) return cmds;
    return cmds
      .filter((c) => fuzzyMatch(q, c.label))
      .sort((a, b) => fuzzyScore(q, b.label) - fuzzyScore(q, a.label));
  });

  const execute = (cmd: Command) => {
    closePalette();
    setQuery("");
    setSelectedIndex(0);
    cmd.action();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const items = filtered();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = selectedIndex();
      if (items[idx]) execute(items[idx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
      setQuery("");
      setSelectedIndex(0);
    }
  };

  // Auto-focus input when palette opens
  const focusInput = () => {
    if (paletteOpen() && inputRef) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.focus());
    }
  };

  // Watch for palette open state changes
  onMount(() => {
    // Create an effect-like check using MutationObserver on the palette visibility
    // Actually, we can just use requestAnimationFrame to check
    let raf: number;
    let wasOpen = false;
    const check = () => {
      const isOpen = paletteOpen();
      if (isOpen && !wasOpen) {
        focusInput();
      }
      wasOpen = isOpen;
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    onCleanup(() => cancelAnimationFrame(raf));
  });

  const handleBackdropClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("palette-backdrop")) {
      closePalette();
      setQuery("");
      setSelectedIndex(0);
    }
  };

  return (
    <Show when={paletteOpen()}>
      <div class="palette-backdrop" onClick={handleBackdropClick}>
        <div class="palette-modal">
          <input
            ref={inputRef}
            class="palette-input"
            type="text"
            placeholder="Type a command..."
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setSelectedIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
          <div class="palette-results">
            <For each={filtered()}>
              {(cmd, idx) => (
                <div
                  class={`palette-item ${idx() === selectedIndex() ? "palette-item-selected" : ""}`}
                  onClick={() => execute(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx())}
                >
                  <span class="palette-item-label">{cmd.label}</span>
                  <Show when={cmd.shortcut}>
                    <span class="palette-item-shortcut">{cmd.shortcut}</span>
                  </Show>
                </div>
              )}
            </For>
            <Show when={filtered().length === 0}>
              <div class="palette-empty">No matching commands</div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
