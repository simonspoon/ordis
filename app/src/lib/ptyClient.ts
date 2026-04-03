import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// --- Types ---

// Mirrors the Rust SessionStatus enum (externally tagged, camelCase).
// Unit variant serializes as a string; tuple variants as { key: value }.
type RustSessionStatus = "running" | { exited: number } | { error: string };

export interface SessionInfo {
  paneId: string;
  pid: number;
  status:
    | { type: "running" }
    | { type: "exited"; code: number }
    | { type: "error"; message: string };
  createdAtMs: number;
}

export interface PtyHandle {
  paneId: string;
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: Uint8Array) => void): void;
  onExit(cb: (exitCode: number) => void): void;
  attach(): Promise<Uint8Array[]>;
  detach(): Promise<void>;
  destroy(): void;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
}

// --- Helpers ---

function normalizeStatus(
  raw: RustSessionStatus,
): SessionInfo["status"] {
  if (raw === "running") {
    return { type: "running" };
  }
  if (typeof raw === "object" && "exited" in raw) {
    return { type: "exited", code: raw.exited };
  }
  if (typeof raw === "object" && "error" in raw) {
    return { type: "error", message: raw.error };
  }
  return { type: "error", message: "Unknown status" };
}

const encoder = new TextEncoder();

// --- Handle factory ---

function createHandle(
  paneId: string,
  pid: number,
): PtyHandle {
  let dataCallback: ((data: Uint8Array) => void) | null = null;
  let exitCallback: ((exitCode: number) => void) | null = null;
  let attached = false;
  const unlisteners: UnlistenFn[] = [];

  async function setupListeners(): Promise<void> {
    const unlistenOutput = await listen<number[]>(
      `pty-output-${paneId}`,
      (event) => {
        if (attached && dataCallback) {
          dataCallback(new Uint8Array(event.payload));
        }
      },
    );
    unlisteners.push(unlistenOutput);

    const unlistenExit = await listen<number>(
      `pty-exit-${paneId}`,
      (event) => {
        if (exitCallback) {
          exitCallback(event.payload);
        }
      },
    );
    unlisteners.push(unlistenExit);
  }

  const handle: PtyHandle = {
    paneId,
    pid,

    write(data: string): void {
      const bytes = encoder.encode(data);
      invoke("pty_write", {
        paneId,
        data: Array.from(bytes),
      });
    },

    resize(cols: number, rows: number): void {
      invoke("pty_resize", { paneId, cols, rows });
    },

    kill(): void {
      invoke("pty_kill", { paneId });
      handle.destroy();
    },

    onData(cb: (data: Uint8Array) => void): void {
      dataCallback = cb;
    },

    onExit(cb: (exitCode: number) => void): void {
      exitCallback = cb;
    },

    async attach(): Promise<Uint8Array[]> {
      const chunks = await invoke<number[][]>("pty_attach", { paneId });
      attached = true;
      return chunks.map((chunk) => new Uint8Array(chunk));
    },

    async detach(): Promise<void> {
      attached = false;
      await invoke("pty_detach", { paneId });
    },

    destroy(): void {
      attached = false;
      for (const unlisten of unlisteners) {
        unlisten();
      }
      unlisteners.length = 0;
    },
  };

  // Kick off listener setup (async, but the handle is usable immediately
  // since callbacks aren't registered until the caller calls onData/onExit).
  setupListeners();

  return handle;
}

// --- Public API ---

export async function spawnPty(
  paneId: string,
  opts: SpawnOptions,
): Promise<PtyHandle> {
  const result = await invoke<{ paneId: string; pid: number }>("pty_spawn", {
    paneId,
    cwd: opts.cwd ?? null,
    env: opts.env ?? {},
    cols: opts.cols,
    rows: opts.rows,
  });

  const handle = createHandle(result.paneId, result.pid);

  // Immediately attach to get scrollback flowing and start the event stream.
  await handle.attach();

  return handle;
}

export interface ReattachResult {
  handle: PtyHandle;
  scrollback: Uint8Array[];
}

export async function reattachPty(
  paneId: string,
): Promise<ReattachResult | null> {
  const sessions = await invoke<RawSessionInfo[]>("pty_list");
  const found = sessions.find((s) => s.paneId === paneId);
  if (!found) {
    return null;
  }

  const handle = createHandle(found.paneId, found.pid);
  const scrollback = await handle.attach();

  return { handle, scrollback };
}

export async function listSessions(): Promise<SessionInfo[]> {
  const raw = await invoke<RawSessionInfo[]>("pty_list");
  return raw.map((s) => ({
    paneId: s.paneId,
    pid: s.pid,
    status: normalizeStatus(s.status),
    createdAtMs: s.createdAtMs,
  }));
}

// The raw shape returned by the Rust pty_list command before status normalization.
interface RawSessionInfo {
  paneId: string;
  pid: number;
  status: RustSessionStatus;
  createdAtMs: number;
}
