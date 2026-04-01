import { describe, it, expect } from "vitest";
import { stripAnsi, parseToolOutput } from "./artifactParser";

// --- stripAnsi ---

describe("stripAnsi", () => {
  it("strips CSI color codes", () => {
    expect(stripAnsi("\x1b[32mhello\x1b[0m")).toBe("hello");
  });

  it("strips bold/underline sequences", () => {
    expect(stripAnsi("\x1b[1m\x1b[4mtext\x1b[0m")).toBe("text");
  });

  it("strips multi-param sequences", () => {
    expect(stripAnsi("\x1b[38;5;196mred\x1b[0m")).toBe("red");
  });

  it("returns plain text unchanged", () => {
    expect(stripAnsi("no escape sequences here")).toBe("no escape sequences here");
  });

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("strips multiple sequences in one line", () => {
    expect(stripAnsi("\x1b[32mCreated\x1b[0m \x1b[36m/src/foo.ts\x1b[0m")).toBe(
      "Created /src/foo.ts"
    );
  });

  it("strips DEC private mode sequences", () => {
    expect(stripAnsi("\x1b[?25lhello\x1b[?25h")).toBe("hello");
    expect(stripAnsi("\x1b[?2004htext\x1b[?2004l")).toBe("text");
  });

  it("strips OSC sequences", () => {
    expect(stripAnsi("\x1b]0;title\x07content")).toBe("content");
  });
});

// --- parseToolOutput: Write/Create detection ---

describe("parseToolOutput — write/create operations", () => {
  it("detects 'Wrote ... to' pattern", () => {
    const result = parseToolOutput("Wrote 42 bytes to /Users/me/project/src/index.ts");
    expect(result).toEqual({
      filePath: "/Users/me/project/src/index.ts",
      operation: "created",
    });
  });

  it("detects 'wrote new file' pattern", () => {
    const result = parseToolOutput("wrote new file /Users/me/project/lib/utils.ts");
    expect(result).toEqual({
      filePath: "/Users/me/project/lib/utils.ts",
      operation: "created",
    });
  });

  it("detects 'Created /path' at line start", () => {
    const result = parseToolOutput("Created /Users/me/project/new-file.tsx");
    expect(result).toEqual({
      filePath: "/Users/me/project/new-file.tsx",
      operation: "created",
    });
  });

  it("detects checkmark + file extension", () => {
    const result = parseToolOutput("  \u2714 /Users/me/project/app.ts");
    expect(result).toEqual({
      filePath: "/Users/me/project/app.ts",
      operation: "created",
    });
  });

  it("detects write with ANSI color codes", () => {
    const result = parseToolOutput(
      "\x1b[32mCreated\x1b[0m \x1b[36m/Users/me/project/src/foo.ts\x1b[0m"
    );
    expect(result).toEqual({
      filePath: "/Users/me/project/src/foo.ts",
      operation: "created",
    });
  });
});

// --- parseToolOutput: Edit detection ---

describe("parseToolOutput — edit operations", () => {
  it("detects 'Edited /path' at line start", () => {
    const result = parseToolOutput("Edited /Users/me/project/src/lib.rs");
    expect(result).toEqual({
      filePath: "/Users/me/project/src/lib.rs",
      operation: "edited",
    });
  });

  it("detects 'Updated /path' at line start", () => {
    const result = parseToolOutput("Updated /Users/me/project/config.toml");
    expect(result).toEqual({
      filePath: "/Users/me/project/config.toml",
      operation: "edited",
    });
  });

  it("detects 'Modified' with path", () => {
    const result = parseToolOutput("Modified /Users/me/project/src/App.tsx");
    expect(result).toEqual({
      filePath: "/Users/me/project/src/App.tsx",
      operation: "edited",
    });
  });

  it("detects 'Replaced' with path", () => {
    const result = parseToolOutput("Replaced /Users/me/project/old-module.js");
    expect(result).toEqual({
      filePath: "/Users/me/project/old-module.js",
      operation: "edited",
    });
  });
});

// --- parseToolOutput: Read detection ---

describe("parseToolOutput — read operations", () => {
  it("detects 'Read /path' at line start with source extension", () => {
    const result = parseToolOutput("Read /Users/me/project/src/store.ts");
    expect(result).toEqual({
      filePath: "/Users/me/project/src/store.ts",
      operation: "read",
    });
  });

  it("detects 'Reading /path' at line start with source extension", () => {
    const result = parseToolOutput("Reading /Users/me/project/src/index.tsx");
    expect(result).toEqual({
      filePath: "/Users/me/project/src/index.tsx",
      operation: "read",
    });
  });

  it("rejects read of path without source extension", () => {
    // 'Read /some/binary' without a known extension should NOT match
    const result = parseToolOutput("Read /Users/me/project/mybinary");
    expect(result).toBeNull();
  });
});

// --- parseToolOutput: Screenshot detection ---

describe("parseToolOutput — screenshot operations", () => {
  it("detects screenshot with .png path", () => {
    const result = parseToolOutput("screenshot saved to /Users/me/screenshots/capture.png");
    expect(result).toEqual({
      filePath: "/Users/me/screenshots/capture.png",
      operation: "screenshot",
    });
  });

  it("detects screen capture with .jpg path", () => {
    const result = parseToolOutput("screen capture /Users/me/output/test.jpg");
    expect(result).toEqual({
      filePath: "/Users/me/output/test.jpg",
      operation: "screenshot",
    });
  });

  it("does not match screenshot keyword with non-image path", () => {
    // "screenshot" keyword but path ends in .txt — not a screenshot artifact
    const result = parseToolOutput("screenshot log at /Users/me/log.txt");
    // Should match as created (if 'Wrote' pattern) or null — NOT as screenshot
    expect(result?.operation).not.toBe("screenshot");
  });
});

// --- parseToolOutput: Claude Code v2 tool header format ---

describe("parseToolOutput — v2 tool header format", () => {
  it("detects Write(path) as created", () => {
    const result = parseToolOutput("Write(/Users/me/project/file.md)");
    expect(result).toEqual({
      filePath: "/Users/me/project/file.md",
      operation: "created",
    });
  });

  it("detects Read(path) with source extension as read", () => {
    const result = parseToolOutput("Read(/Users/me/project/src/index.ts)");
    expect(result).toEqual({
      filePath: "/Users/me/project/src/index.ts",
      operation: "read",
    });
  });

  it("detects Edit(path) as edited", () => {
    const result = parseToolOutput("Edit(/Users/me/project/src/lib.rs)");
    expect(result).toEqual({
      filePath: "/Users/me/project/src/lib.rs",
      operation: "edited",
    });
  });

  it("detects Write with bullet prefix", () => {
    const result = parseToolOutput("⏺ Write(/Users/me/project/file.md)");
    expect(result).toEqual({
      filePath: "/Users/me/project/file.md",
      operation: "created",
    });
  });

  it("detects Write with ANSI-wrapped bullet prefix", () => {
    const result = parseToolOutput(
      "\x1b[1m⏺\x1b[0m Write(/Users/me/project/file.md)"
    );
    expect(result).toEqual({
      filePath: "/Users/me/project/file.md",
      operation: "created",
    });
  });

  it("rejects Read(path) without source extension", () => {
    const result = parseToolOutput("Read(/Users/me/project/mybinary)");
    expect(result).toBeNull();
  });

  it("detects Write(.svg) as created, not screenshot", () => {
    const result = parseToolOutput("Write(/tmp/test/image.svg)");
    expect(result).toEqual({
      filePath: "/tmp/test/image.svg",
      operation: "created",
    });
  });

  it("detects Write with non-⏺ bullet characters", () => {
    // Claude Code may use different Unicode bullet characters across versions
    for (const bullet of ["●", "⬤", "◉", "•"]) {
      const result = parseToolOutput(`${bullet} Write(/tmp/test/file.ts)`);
      expect(result).toEqual({
        filePath: "/tmp/test/file.ts",
        operation: "created",
      });
    }
  });

  it("detects tool header concatenated with previous output (PTY buffering)", () => {
    // PTY data may concatenate tool header with previous line output
    const result = parseToolOutput("Done⏺ Write(/tmp/test/file.md)");
    expect(result).toEqual({
      filePath: "/tmp/test/file.md",
      operation: "created",
    });
  });
});

// --- parseToolOutput: False positive rejection ---

describe("parseToolOutput — false positive rejection", () => {
  it("rejects blank lines", () => {
    expect(parseToolOutput("")).toBeNull();
    expect(parseToolOutput("   ")).toBeNull();
    expect(parseToolOutput("\t\t")).toBeNull();
  });

  it("rejects box-drawing lines (tree output)", () => {
    expect(parseToolOutput("  ├─ fhwa  Artifact store")).toBeNull();
    expect(parseToolOutput("  └─ dort  Integration")).toBeNull();
    expect(parseToolOutput("  │")).toBeNull();
  });

  it("rejects diff headers", () => {
    expect(parseToolOutput("diff --git a/foo.ts b/foo.ts")).toBeNull();
    expect(parseToolOutput("--- a/foo.ts")).toBeNull();
    expect(parseToolOutput("+++ b/foo.ts")).toBeNull();
    expect(parseToolOutput("@@ -1,5 +1,7 @@")).toBeNull();
  });

  it("rejects system paths — /dev/, /proc/, /sys/", () => {
    expect(parseToolOutput("Read /dev/null")).toBeNull();
    expect(parseToolOutput("Read /proc/1/status")).toBeNull();
    expect(parseToolOutput("Read /sys/class/net/en0")).toBeNull();
  });

  it("rejects lines without file paths", () => {
    expect(parseToolOutput("Building project...")).toBeNull();
    expect(parseToolOutput("Compiling 42 modules")).toBeNull();
    expect(parseToolOutput("Done in 3.2s")).toBeNull();
  });

  it("rejects generic 'Updated' without line-start path (npm output)", () => {
    // npm install outputs "Updated 5 packages in 2.3s" — no path at line start
    expect(parseToolOutput("Updated 5 packages in 2.3s")).toBeNull();
  });

  it("rejects 'Created' mid-line without leading path", () => {
    // e.g. "Process created at PID 1234"
    expect(parseToolOutput("Process created at PID 1234")).toBeNull();
  });

  it("rejects code block line numbers", () => {
    expect(parseToolOutput("  42 │ const foo = 'bar';")).toBeNull();
  });
});

// --- parseToolOutput: Path extraction edge cases ---

describe("parseToolOutput — path extraction", () => {
  it("extracts absolute path from line with surrounding text", () => {
    const result = parseToolOutput("Wrote 100 bytes to /Users/me/project/src/deep/nested/file.ts");
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe("/Users/me/project/src/deep/nested/file.ts");
  });

  it("strips trailing punctuation from path", () => {
    const result = parseToolOutput("Created /Users/me/project/file.ts.");
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe("/Users/me/project/file.ts");
  });

  it("handles paths with hyphens and underscores", () => {
    const result = parseToolOutput("Edited /Users/me/my-project/some_module/index.ts");
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe("/Users/me/my-project/some_module/index.ts");
  });

  it("handles paths with dots in directory names", () => {
    const result = parseToolOutput("Edited /Users/me/.config/ordis/settings.json");
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe("/Users/me/.config/ordis/settings.json");
  });

  it("does not match bare slash", () => {
    expect(parseToolOutput("Created /")).toBeNull();
  });
});

// --- parseToolOutput: ANSI in real-world Claude Code output ---

describe("parseToolOutput — ANSI handling in detection", () => {
  it("detects edit through heavy ANSI formatting", () => {
    const result = parseToolOutput(
      "\x1b[1m\x1b[33mEdited\x1b[0m \x1b[36m/Users/me/project/src/App.tsx\x1b[0m"
    );
    expect(result).toEqual({
      filePath: "/Users/me/project/src/App.tsx",
      operation: "edited",
    });
  });

  it("detects write through 256-color ANSI codes", () => {
    const result = parseToolOutput(
      "\x1b[38;5;82mCreated\x1b[0m /Users/me/project/new.ts"
    );
    expect(result).toEqual({
      filePath: "/Users/me/project/new.ts",
      operation: "created",
    });
  });
});
