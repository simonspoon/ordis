import { createStore, produce } from "solid-js/store";

// --- Types ---

export type ArtifactOperation = "created" | "edited" | "read" | "screenshot";

export interface ArtifactEntry {
  id: string;
  filePath: string;
  fileName: string;
  operation: ArtifactOperation;
  viewerType: string;
  /** Whether preEditContent is available (stored separately to avoid reactive diffing overhead) */
  hasPreEditContent?: boolean;
  timestamp: number;
}

// --- Constants ---

const MAX_ARTIFACTS = 200;

// --- State ---

const [artifacts, setArtifacts] = createStore<Record<string, ArtifactEntry>>({});

// Store preEditContent outside the reactive store to avoid diffing overhead on large strings
const preEditContentMap = new Map<string, string>();

// --- Actions ---

/** Evict oldest entries when the artifact count exceeds MAX_ARTIFACTS */
function evictOldest() {
  const entries = Object.values(artifacts);
  if (entries.length <= MAX_ARTIFACTS) return;

  // Sort by timestamp ascending (oldest first)
  const sorted = entries.slice().sort((a, b) => a.timestamp - b.timestamp);
  const toEvict = sorted.slice(0, entries.length - MAX_ARTIFACTS);

  setArtifacts(produce((a) => {
    for (const entry of toEvict) {
      preEditContentMap.delete(entry.id);
      delete a[entry.id];
    }
  }));
}

export function addArtifact(entry: Omit<ArtifactEntry, "id" | "timestamp" | "hasPreEditContent"> & { preEditContent?: string }): ArtifactEntry {
  const existing = Object.values(artifacts).find((a) => a.filePath === entry.filePath);

  if (existing) {
    // Update existing entry — preserve preEditContent from first add
    if (entry.preEditContent && !preEditContentMap.has(existing.id)) {
      preEditContentMap.set(existing.id, entry.preEditContent);
    }
    setArtifacts(existing.id, {
      operation: entry.operation,
      viewerType: entry.viewerType,
      timestamp: Date.now(),
      hasPreEditContent: preEditContentMap.has(existing.id),
    });
    return artifacts[existing.id];
  }

  const id = crypto.randomUUID();
  if (entry.preEditContent) {
    preEditContentMap.set(id, entry.preEditContent);
  }
  const artifact: ArtifactEntry = {
    id,
    filePath: entry.filePath,
    fileName: entry.fileName,
    operation: entry.operation,
    viewerType: entry.viewerType,
    hasPreEditContent: !!entry.preEditContent,
    timestamp: Date.now(),
  };
  setArtifacts(id, artifact);
  evictOldest();
  return artifact;
}

/** Retrieve preEditContent for an artifact (stored outside reactive store) */
export function getPreEditContent(id: string): string | undefined {
  return preEditContentMap.get(id);
}

export function updateArtifact(id: string, updates: Partial<Pick<ArtifactEntry, "operation" | "viewerType">> & { preEditContent?: string }) {
  if (!artifacts[id]) return;
  if (updates.preEditContent) {
    preEditContentMap.set(id, updates.preEditContent);
  }
  const { preEditContent: _, ...storeUpdates } = updates;
  setArtifacts(id, {
    ...storeUpdates,
    ...(updates.preEditContent ? { hasPreEditContent: true } : {}),
  });
}

export function getArtifacts(): ArtifactEntry[] {
  return Object.values(artifacts).sort((a, b) => b.timestamp - a.timestamp);
}

export function getArtifactByPath(filePath: string): ArtifactEntry | undefined {
  return Object.values(artifacts).find((a) => a.filePath === filePath);
}

export function clearArtifacts() {
  preEditContentMap.clear();
  setArtifacts(produce((a) => {
    for (const key of Object.keys(a)) {
      delete a[key];
    }
  }));
}

