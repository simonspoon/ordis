import { describe, it, expect, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import {
  addArtifact,
  getArtifacts,
  getArtifactByPath,
  getPreEditContent,
  clearArtifacts,
  updateArtifact,
} from "./artifacts";

// Helper: run inside a reactive root so Solid.js stores work
function withRoot<T>(fn: () => T): T {
  let result: T;
  createRoot((dispose) => {
    result = fn();
    dispose();
  });
  return result!;
}

beforeEach(() => {
  withRoot(() => clearArtifacts());
});

// --- addArtifact & getArtifacts ---

describe("addArtifact", () => {
  it("adds an artifact and returns it with id and timestamp", () => {
    const entry = withRoot(() =>
      addArtifact({
        filePath: "/project/src/index.ts",
        fileName: "index.ts",
        operation: "created",
        viewerType: "code",
      })
    );
    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.filePath).toBe("/project/src/index.ts");
    expect(entry.operation).toBe("created");
  });

  it("getArtifacts returns artifacts sorted newest-first", async () => {
    withRoot(() => {
      addArtifact({
        filePath: "/project/a.ts",
        fileName: "a.ts",
        operation: "created",
        viewerType: "code",
      });
    });

    // Wait 2ms to guarantee different Date.now() values
    await new Promise((r) => setTimeout(r, 2));

    withRoot(() => {
      addArtifact({
        filePath: "/project/b.ts",
        fileName: "b.ts",
        operation: "edited",
        viewerType: "code",
      });
    });

    const artifacts = withRoot(() => getArtifacts());
    expect(artifacts.length).toBe(2);
    // Newest first — b.ts should be first (added later)
    expect(artifacts[0].fileName).toBe("b.ts");
    expect(artifacts[1].fileName).toBe("a.ts");
  });
});

// --- Deduplication ---

describe("deduplication by filePath", () => {
  it("updates existing entry when same filePath is added again", () => {
    withRoot(() => {
      addArtifact({
        filePath: "/project/src/store.ts",
        fileName: "store.ts",
        operation: "read",
        viewerType: "code",
      });

      addArtifact({
        filePath: "/project/src/store.ts",
        fileName: "store.ts",
        operation: "edited",
        viewerType: "code",
      });
    });

    const artifacts = withRoot(() => getArtifacts());
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].operation).toBe("edited");
  });

  it("preserves preEditContent from first add on deduplication", () => {
    withRoot(() => {
      addArtifact({
        filePath: "/project/src/foo.ts",
        fileName: "foo.ts",
        operation: "read",
        viewerType: "code",
        preEditContent: "original content",
      });

      // Second add with different preEditContent should NOT overwrite
      addArtifact({
        filePath: "/project/src/foo.ts",
        fileName: "foo.ts",
        operation: "edited",
        viewerType: "code",
        preEditContent: "should be ignored",
      });
    });

    const artifact = withRoot(() => getArtifactByPath("/project/src/foo.ts"));
    expect(artifact).toBeTruthy();
    expect(artifact!.hasPreEditContent).toBe(true);

    const content = getPreEditContent(artifact!.id);
    expect(content).toBe("original content");
  });
});

// --- preEditContent stored outside reactive store ---

describe("preEditContent storage", () => {
  it("stores preEditContent in separate map, not in ArtifactEntry", () => {
    const entry = withRoot(() =>
      addArtifact({
        filePath: "/project/src/data.ts",
        fileName: "data.ts",
        operation: "edited",
        viewerType: "code",
        preEditContent: "const x = 1;",
      })
    );

    // Entry itself should have hasPreEditContent flag, not the actual content
    expect(entry.hasPreEditContent).toBe(true);
    expect((entry as any).preEditContent).toBeUndefined();

    // Content accessible via getPreEditContent
    expect(getPreEditContent(entry.id)).toBe("const x = 1;");
  });

  it("returns undefined for artifacts without preEditContent", () => {
    const entry = withRoot(() =>
      addArtifact({
        filePath: "/project/src/new.ts",
        fileName: "new.ts",
        operation: "created",
        viewerType: "code",
      })
    );

    expect(entry.hasPreEditContent).toBeFalsy();
    expect(getPreEditContent(entry.id)).toBeUndefined();
  });

  it("clears preEditContent map when clearArtifacts is called", () => {
    const entry = withRoot(() =>
      addArtifact({
        filePath: "/project/src/data.ts",
        fileName: "data.ts",
        operation: "edited",
        viewerType: "code",
        preEditContent: "old content",
      })
    );

    const id = entry.id;
    withRoot(() => clearArtifacts());

    expect(getPreEditContent(id)).toBeUndefined();
    expect(withRoot(() => getArtifacts()).length).toBe(0);
  });
});

// --- getArtifactByPath ---

describe("getArtifactByPath", () => {
  it("returns the artifact matching the given path", () => {
    withRoot(() => {
      addArtifact({
        filePath: "/project/src/target.ts",
        fileName: "target.ts",
        operation: "created",
        viewerType: "code",
      });
      addArtifact({
        filePath: "/project/src/other.ts",
        fileName: "other.ts",
        operation: "created",
        viewerType: "code",
      });
    });

    const found = withRoot(() => getArtifactByPath("/project/src/target.ts"));
    expect(found).toBeTruthy();
    expect(found!.fileName).toBe("target.ts");
  });

  it("returns undefined when path not found", () => {
    const found = withRoot(() => getArtifactByPath("/nonexistent/file.ts"));
    expect(found).toBeUndefined();
  });
});

// --- updateArtifact ---

describe("updateArtifact", () => {
  it("updates operation and viewerType", () => {
    const entry = withRoot(() =>
      addArtifact({
        filePath: "/project/src/mod.ts",
        fileName: "mod.ts",
        operation: "read",
        viewerType: "code",
      })
    );

    withRoot(() =>
      updateArtifact(entry.id, { operation: "edited", viewerType: "diff" })
    );

    const artifacts = withRoot(() => getArtifacts());
    expect(artifacts[0].operation).toBe("edited");
    expect(artifacts[0].viewerType).toBe("diff");
  });

  it("does nothing for non-existent id", () => {
    // Should not throw
    withRoot(() => updateArtifact("nonexistent-id", { operation: "edited" }));
    expect(withRoot(() => getArtifacts()).length).toBe(0);
  });

  it("can add preEditContent via update", () => {
    const entry = withRoot(() =>
      addArtifact({
        filePath: "/project/src/late.ts",
        fileName: "late.ts",
        operation: "read",
        viewerType: "code",
      })
    );

    withRoot(() =>
      updateArtifact(entry.id, { preEditContent: "late snapshot" })
    );

    expect(getPreEditContent(entry.id)).toBe("late snapshot");
  });
});

// --- Eviction at MAX_ARTIFACTS ---

describe("eviction at MAX_ARTIFACTS (200)", () => {
  it("evicts oldest entries when exceeding 200", () => {
    withRoot(() => {
      // Add 205 artifacts
      for (let i = 0; i < 205; i++) {
        addArtifact({
          filePath: `/project/file-${String(i).padStart(4, "0")}.ts`,
          fileName: `file-${String(i).padStart(4, "0")}.ts`,
          operation: "created",
          viewerType: "code",
        });
      }
    });

    const artifacts = withRoot(() => getArtifacts());
    // Should be capped at 200
    expect(artifacts.length).toBe(200);

    // The oldest 5 (file-0000 through file-0004) should have been evicted
    const paths = artifacts.map((a) => a.filePath);
    expect(paths).not.toContain("/project/file-0000.ts");
    expect(paths).not.toContain("/project/file-0004.ts");
    // The newest should still be present
    expect(paths).toContain("/project/file-0204.ts");
    expect(paths).toContain("/project/file-0200.ts");
  });

  it("evicts preEditContent for evicted entries", () => {
    const ids: string[] = [];
    withRoot(() => {
      // Add 201 with preEditContent on the first one
      const first = addArtifact({
        filePath: "/project/will-be-evicted.ts",
        fileName: "will-be-evicted.ts",
        operation: "edited",
        viewerType: "code",
        preEditContent: "should be cleaned up",
      });
      ids.push(first.id);

      for (let i = 1; i <= 200; i++) {
        addArtifact({
          filePath: `/project/file-${i}.ts`,
          fileName: `file-${i}.ts`,
          operation: "created",
          viewerType: "code",
        });
      }
    });

    // The first entry should have been evicted (it's the oldest)
    expect(getPreEditContent(ids[0])).toBeUndefined();
  });
});

// --- clearArtifacts ---

describe("clearArtifacts", () => {
  it("removes all artifacts", () => {
    withRoot(() => {
      addArtifact({
        filePath: "/project/a.ts",
        fileName: "a.ts",
        operation: "created",
        viewerType: "code",
      });
      addArtifact({
        filePath: "/project/b.ts",
        fileName: "b.ts",
        operation: "edited",
        viewerType: "code",
        preEditContent: "old",
      });

      expect(getArtifacts().length).toBe(2);
      clearArtifacts();
      expect(getArtifacts().length).toBe(0);
    });
  });
});
