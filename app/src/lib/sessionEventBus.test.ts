import { describe, it, expect, vi } from "vitest";
import { SessionEventBus, createSessionEventBus } from "./sessionEventBus";

const encode = (s: string) => new TextEncoder().encode(s);

// --- Factory ---

describe("createSessionEventBus", () => {
  it("returns a SessionEventBus instance", () => {
    const bus = createSessionEventBus();
    expect(bus).toBeInstanceOf(SessionEventBus);
  });
});

// --- feed() with complete lines ---

describe("feed — complete lines", () => {
  it("emits file_written for a Created line", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("file_written", handler);

    bus.feed(encode("Created /Users/me/project/foo.ts\n"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "file_written",
      path: "/Users/me/project/foo.ts",
      operation: "created",
    });
  });

  it("emits file_written for an Edited line", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("file_written", handler);

    bus.feed(encode("Edited /Users/me/project/bar.ts\n"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "file_written",
      path: "/Users/me/project/bar.ts",
      operation: "edited",
    });
  });

  it("emits file_read for a Read line", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("file_read", handler);

    bus.feed(encode("Read /Users/me/project/store.ts\n"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "file_read",
      path: "/Users/me/project/store.ts",
    });
  });

  it("emits file_written for a screenshot line with screenshot operation", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("file_written", handler);

    bus.feed(encode("screenshot saved to /Users/me/screenshots/capture.png\n"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "file_written",
      path: "/Users/me/screenshots/capture.png",
      operation: "screenshot",
    });
  });

  it("emits raw event for every feed call", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("raw", handler);

    bus.feed(encode("some text\n"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "raw",
      data: "some text\n",
    });
  });

  it("processes multiple lines in a single feed", () => {
    const bus = createSessionEventBus();
    const written = vi.fn();
    const read = vi.fn();
    bus.on("file_written", written);
    bus.on("file_read", read);

    bus.feed(encode("Created /a/b.ts\nRead /c/d.ts\nEdited /e/f.ts\n"));

    expect(written).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledOnce();
  });
});

// --- feed() with partial lines (buffering) ---

describe("feed — line buffering", () => {
  it("buffers partial lines until a newline arrives", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("file_written", handler);

    bus.feed(encode("Created /Users/me/pro"));
    expect(handler).not.toHaveBeenCalled();

    bus.feed(encode("ject/foo.ts\n"));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "file_written",
      path: "/Users/me/project/foo.ts",
      operation: "created",
    });
  });

  it("handles multiple partial feeds before newline", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("file_written", handler);

    bus.feed(encode("Cre"));
    bus.feed(encode("ated /Us"));
    bus.feed(encode("ers/me/p/a.ts\n"));

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not emit line events for incomplete trailing content", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("file_written", handler);

    bus.feed(encode("Created /a/b.ts\nEdited /c/d.ts"));

    // First line complete, second line buffered
    expect(handler).toHaveBeenCalledOnce();
  });
});

// --- on() and unsubscribe ---

describe("on — subscribe and unsubscribe", () => {
  it("returns an unsubscribe function that removes the handler", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    const unsub = bus.on("file_written", handler);

    bus.emit({ type: "file_written", path: "/a/b.ts", operation: "created" });
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    bus.emit({ type: "file_written", path: "/c/d.ts", operation: "created" });
    expect(handler).toHaveBeenCalledOnce(); // not called again
  });

  it("supports multiple handlers on the same event type", () => {
    const bus = createSessionEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("file_read", h1);
    bus.on("file_read", h2);

    bus.emit({ type: "file_read", path: "/a.ts" });

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("unsubscribing one handler does not affect others", () => {
    const bus = createSessionEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub1 = bus.on("file_written", h1);
    bus.on("file_written", h2);

    unsub1();
    bus.emit({ type: "file_written", path: "/a.ts", operation: "created" });

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });
});

// --- on("*") wildcard ---

describe("on('*') — wildcard subscription", () => {
  it("receives all event types", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("*", handler);

    bus.emit({ type: "file_written", path: "/a.ts", operation: "created" });
    bus.emit({ type: "file_read", path: "/b.ts" });
    bus.emit({ type: "cwd", path: "/home" });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenCalledWith({ type: "file_written", path: "/a.ts", operation: "created" });
    expect(handler).toHaveBeenCalledWith({ type: "file_read", path: "/b.ts" });
    expect(handler).toHaveBeenCalledWith({ type: "cwd", path: "/home" });
  });

  it("wildcard unsubscribe works", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    const unsub = bus.on("*", handler);

    bus.emit({ type: "raw", data: "x" });
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    bus.emit({ type: "raw", data: "y" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("wildcard and typed handlers both fire", () => {
    const bus = createSessionEventBus();
    const typed = vi.fn();
    const wild = vi.fn();
    bus.on("file_written", typed);
    bus.on("*", wild);

    bus.emit({ type: "file_written", path: "/a.ts", operation: "created" });

    expect(typed).toHaveBeenCalledOnce();
    expect(wild).toHaveBeenCalledOnce();
  });
});

// --- emit() for synthetic events ---

describe("emit — synthetic events", () => {
  it("emits cwd events", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("cwd", handler);

    bus.emit({ type: "cwd", path: "/Users/me/project" });

    expect(handler).toHaveBeenCalledWith({
      type: "cwd",
      path: "/Users/me/project",
    });
  });

  it("emits message events", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("message", handler);

    bus.emit({ type: "message", role: "assistant", text: "Hello" });

    expect(handler).toHaveBeenCalledWith({
      type: "message",
      role: "assistant",
      text: "Hello",
    });
  });

  it("emits status events", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("status", handler);

    bus.emit({ type: "status", status: "idle" });

    expect(handler).toHaveBeenCalledWith({
      type: "status",
      status: "idle",
    });
  });

  it("emits command_run events", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("command_run", handler);

    bus.emit({ type: "command_run", command: "ls -la", exitCode: 0 });

    expect(handler).toHaveBeenCalledWith({
      type: "command_run",
      command: "ls -la",
      exitCode: 0,
    });
  });
});

// --- destroy() ---

describe("destroy", () => {
  it("clears all handlers so events are no longer received", () => {
    const bus = createSessionEventBus();
    const typed = vi.fn();
    const wild = vi.fn();
    bus.on("file_written", typed);
    bus.on("*", wild);

    bus.destroy();

    bus.emit({ type: "file_written", path: "/a.ts", operation: "created" });
    expect(typed).not.toHaveBeenCalled();
    expect(wild).not.toHaveBeenCalled();
  });

  it("clears the line buffer so partial data is discarded", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("file_written", handler);

    bus.feed(encode("Created /Users/me/partial"));
    bus.destroy();

    // Re-subscribe after destroy
    bus.on("file_written", handler);
    bus.feed(encode(".ts\n"));

    // The partial should have been discarded — ".ts\n" alone won't match
    expect(handler).not.toHaveBeenCalled();
  });
});

// --- Status detection from PTY output ---

describe("feed — status detection", () => {
  it("emits thinking status", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("status", handler);

    bus.feed(encode("Thinking...\n"));

    expect(handler).toHaveBeenCalledWith({
      type: "status",
      status: "thinking",
    });
  });

  it("emits tool_use status for Running", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("status", handler);

    bus.feed(encode("Running command...\n"));

    expect(handler).toHaveBeenCalledWith({
      type: "status",
      status: "tool_use",
    });
  });
});

// --- Command detection from PTY output ---

describe("feed — command detection", () => {
  it("detects exit code", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("command_run", handler);

    bus.feed(encode("Exit code: 0\n"));

    expect(handler).toHaveBeenCalledWith({
      type: "command_run",
      command: "",
      exitCode: 0,
    });
  });

  it("detects non-zero exit code", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("command_run", handler);

    bus.feed(encode("Exit code: 1\n"));

    expect(handler).toHaveBeenCalledWith({
      type: "command_run",
      command: "",
      exitCode: 1,
    });
  });
});

// --- Carriage return stripping ---

describe("feed — carriage return handling", () => {
  it("strips \\r before parsing lines", () => {
    const bus = createSessionEventBus();
    const handler = vi.fn();
    bus.on("file_written", handler);

    bus.feed(encode("Created /Users/me/project/foo.ts\r\n"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: "file_written",
      path: "/Users/me/project/foo.ts",
      operation: "created",
    });
  });
});

// --- No false positives for unrecognized lines ---

describe("feed — no false positives", () => {
  it("does not emit file events for plain text", () => {
    const bus = createSessionEventBus();
    const written = vi.fn();
    const read = vi.fn();
    bus.on("file_written", written);
    bus.on("file_read", read);

    bus.feed(encode("Building project...\nDone in 3.2s\n"));

    expect(written).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
