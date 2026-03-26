import { onMount, onCleanup } from "solid-js";
import { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import { FitAddon } from "@xterm/addon-fit";
import { spawn } from "tauri-pty";
import { cwd, closePane } from "../lib/store";
import "@xterm/xterm/css/xterm.css";

interface Props {
  paneId: string;
  visible: boolean;
}

export default function TerminalPane(props: Props) {
  let containerRef!: HTMLDivElement;
  let term: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let pty: ReturnType<typeof spawn> | null = null;
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    term = new Terminal({
      fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 14,
      lineHeight: 1.3,
      theme: {
        background: "#1a1a2e",
        foreground: "#e0e0e0",
        cursor: "#7c5cbf",
        cursorAccent: "#1a1a2e",
        selectionBackground: "rgba(124, 92, 191, 0.3)",
        black: "#1a1a2e",
        red: "#e55555",
        green: "#4ec9b0",
        yellow: "#e0a84e",
        blue: "#569cd6",
        magenta: "#c586c0",
        cyan: "#56b6c2",
        white: "#e0e0e0",
        brightBlack: "#606070",
        brightRed: "#ff6b6b",
        brightGreen: "#6ee7b7",
        brightYellow: "#fbbf24",
        brightBlue: "#7cb3f0",
        brightMagenta: "#d19fd6",
        brightCyan: "#7ee0e0",
        brightWhite: "#ffffff",
      },
      convertEol: true,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef);

    // Try WebGL renderer, fall back to DOM
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // DOM renderer is fine
    }

    fitAddon.fit();

    // Spawn PTY with claude
    const currentCwd = cwd() || undefined;
    pty = spawn("/bin/zsh", ["-l", "-c", "claude --dangerously-skip-permissions"], {
      cols: term.cols,
      rows: term.rows,
      cwd: currentCwd,
      name: "xterm-256color",
    });

    // PTY -> terminal
    pty.onData((data: Uint8Array) => {
      term!.write(new Uint8Array(data));
    });

    // Terminal -> PTY (user keystrokes)
    term.onData((data: string) => {
      pty!.write(data);
    });

    // Keep PTY size in sync with terminal
    term.onResize(({ cols, rows }) => {
      pty!.resize(cols, rows);
    });

    // Close pane when claude exits
    pty.onExit(() => {
      closePane(props.paneId);
    });

    // Resize on container size changes
    resizeObserver = new ResizeObserver(() => {
      if (props.visible && fitAddon) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(containerRef);
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    if (pty) {
      try { pty.kill(); } catch { /* already dead */ }
    }
    term?.dispose();
  });

  return (
    <div
      ref={containerRef}
      class="terminal-pane"
      style={{ display: props.visible ? "block" : "none" }}
    />
  );
}
