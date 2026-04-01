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

// Outer key: paneId, inner key: artifact ID
const [artifacts, setArtifacts] = createStore<Record<string, Record<string, ArtifactEntry>>>({});

// Store preEditContent outside the reactive store to avoid diffing overhead on large strings
// Keyed by "paneId:artifactId"
const preEditContentMap = new Map<string, string>();

function preEditKey(paneId: string, artifactId: string): string {
  return `${paneId}:${artifactId}`;
}

// --- Actions ---

/** Evict oldest entries when the artifact count for a pane exceeds MAX_ARTIFACTS */
function evictOldest(paneId: string) {
  const paneArtifacts = artifacts[paneId];
  if (!paneArtifacts) return;

  const entries = Object.values(paneArtifacts);
  if (entries.length <= MAX_ARTIFACTS) return;

  // Sort by timestamp ascending (oldest first)
  const sorted = entries.slice().sort((a, b) => a.timestamp - b.timestamp);
  const toEvict = sorted.slice(0, entries.length - MAX_ARTIFACTS);

  setArtifacts(paneId, produce((a) => {
    for (const entry of toEvict) {
      preEditContentMap.delete(preEditKey(paneId, entry.id));
      delete a[entry.id];
    }
  }));
}

export function addArtifact(paneId: string, entry: Omit<ArtifactEntry, "id" | "timestamp" | "hasPreEditContent"> & { preEditContent?: string }): ArtifactEntry {
  // Ensure pane bucket exists
  if (!artifacts[paneId]) {
    setArtifacts(paneId, {});
  }

  const paneArtifacts = artifacts[paneId];
  const existing = Object.values(paneArtifacts).find((a) => a.filePath === entry.filePath);

  if (existing) {
    // Update existing entry — preserve preEditContent from first add
    const key = preEditKey(paneId, existing.id);
    if (entry.preEditContent && !preEditContentMap.has(key)) {
      preEditContentMap.set(key, entry.preEditContent);
    }
    setArtifacts(paneId, existing.id, {
      operation: entry.operation,
      viewerType: entry.viewerType,
      timestamp: Date.now(),
      hasPreEditContent: preEditContentMap.has(key),
    });
    return artifacts[paneId][existing.id];
  }

  const id = crypto.randomUUID();
  const key = preEditKey(paneId, id);
  if (entry.preEditContent) {
    preEditContentMap.set(key, entry.preEditContent);
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
  setArtifacts(paneId, id, artifact);
  evictOldest(paneId);
  return artifact;
}

/** Retrieve preEditContent for an artifact (stored outside reactive store) */
export function getPreEditContent(paneId: string, id: string): string | undefined {
  return preEditContentMap.get(preEditKey(paneId, id));
}

export function updateArtifact(paneId: string, id: string, updates: Partial<Pick<ArtifactEntry, "operation" | "viewerType">> & { preEditContent?: string }) {
  if (!artifacts[paneId]?.[id]) return;
  if (updates.preEditContent) {
    preEditContentMap.set(preEditKey(paneId, id), updates.preEditContent);
  }
  const { preEditContent: _, ...storeUpdates } = updates;
  setArtifacts(paneId, id, {
    ...storeUpdates,
    ...(updates.preEditContent ? { hasPreEditContent: true } : {}),
  });
}

export function getArtifacts(paneId: string): ArtifactEntry[] {
  const paneArtifacts = artifacts[paneId];
  if (!paneArtifacts) return [];
  return Object.values(paneArtifacts).sort((a, b) => b.timestamp - a.timestamp);
}

export function getArtifactByPath(paneId: string, filePath: string): ArtifactEntry | undefined {
  const paneArtifacts = artifacts[paneId];
  if (!paneArtifacts) return undefined;
  return Object.values(paneArtifacts).find((a) => a.filePath === filePath);
}

export function clearArtifacts(paneId: string) {
  const paneArtifacts = artifacts[paneId];
  if (paneArtifacts) {
    for (const entry of Object.values(paneArtifacts)) {
      preEditContentMap.delete(preEditKey(paneId, entry.id));
    }
  }
  setArtifacts(paneId, produce((a) => {
    for (const key of Object.keys(a)) {
      delete a[key];
    }
  }));
}
