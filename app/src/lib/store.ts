import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";

// --- Types ---

export type PaneType = "terminal" | "viewer";
export type ViewerType = "code" | "markdown" | "image" | "pdf" | "diff";

export interface PaneState {
  id: string;
  cwd: string;
  paneType: PaneType;
  agent?: string;
  effort?: string;
  prompt?: string;
  viewerType?: ViewerType;
  filePath?: string;
  fileLabel?: string;
}

export type LayoutNode =
  | { type: "leaf"; paneId: string }
  | {
      type: "split";
      id: string;
      direction: "horizontal" | "vertical";
      first: LayoutNode;
      second: LayoutNode;
      ratio: number;
    };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DividerInfo {
  splitId: string;
  direction: "horizontal" | "vertical";
  splitRect: Rect;
  x: number;
  y: number;
  length: number;
}

// --- State ---

export const [panes, setPanes] = createStore<Record<string, PaneState>>({});
export const [activePaneId, setActivePaneId] = createSignal("");
export const [layout, setLayout] = createSignal<LayoutNode | null>(null);
export const [zoomedPaneId, setZoomedPaneId] = createSignal<string | null>(null);

// --- Derived ---

export function getLeafPaneIds(node?: LayoutNode | null): string[] {
  const n = node === undefined ? layout() : node;
  if (!n) return [];
  if (n.type === "leaf") return [n.paneId];
  return [...getLeafPaneIds(n.first), ...getLeafPaneIds(n.second)];
}

export function computePositions(
  node: LayoutNode | null,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
): Record<string, Rect> {
  if (!node) return {};
  if (node.type === "leaf") return { [node.paneId]: rect };
  const { direction, first, second, ratio } = node;
  const [r1, r2] =
    direction === "vertical"
      ? [
          { x: rect.x, y: rect.y, w: rect.w * ratio, h: rect.h },
          { x: rect.x + rect.w * ratio, y: rect.y, w: rect.w * (1 - ratio), h: rect.h },
        ]
      : [
          { x: rect.x, y: rect.y, w: rect.w, h: rect.h * ratio },
          { x: rect.x, y: rect.y + rect.h * ratio, w: rect.w, h: rect.h * (1 - ratio) },
        ];
  return { ...computePositions(first, r1), ...computePositions(second, r2) };
}

export function computeDividers(
  node: LayoutNode | null,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
): DividerInfo[] {
  if (!node || node.type === "leaf") return [];
  const { direction, id, first, second, ratio } = node;
  const divider: DividerInfo = {
    splitId: id,
    direction,
    splitRect: rect,
    x: direction === "vertical" ? rect.x + rect.w * ratio : rect.x,
    y: direction === "horizontal" ? rect.y + rect.h * ratio : rect.y,
    length: direction === "vertical" ? rect.h : rect.w,
  };
  const [r1, r2] =
    direction === "vertical"
      ? [
          { x: rect.x, y: rect.y, w: rect.w * ratio, h: rect.h },
          { x: rect.x + rect.w * ratio, y: rect.y, w: rect.w * (1 - ratio), h: rect.h },
        ]
      : [
          { x: rect.x, y: rect.y, w: rect.w, h: rect.h * ratio },
          { x: rect.x, y: rect.y + rect.h * ratio, w: rect.w, h: rect.h * (1 - ratio) },
        ];
  return [divider, ...computeDividers(first, r1), ...computeDividers(second, r2)];
}

export function computeEffectivePositions(
  node: LayoutNode | null,
): Record<string, Rect> {
  const zoomed = zoomedPaneId();
  if (zoomed) {
    const allIds = getLeafPaneIds(node);
    const result: Record<string, Rect> = {};
    for (const id of allIds) {
      result[id] = id === zoomed
        ? { x: 0, y: 0, w: 1, h: 1 }
        : { x: 0, y: 0, w: 0, h: 0 };
    }
    return result;
  }
  return computePositions(node);
}

export function toggleZoom() {
  const active = activePaneId();
  if (!active) return;
  const current = zoomedPaneId();
  if (current === active) {
    setZoomedPaneId(null);
  } else {
    setZoomedPaneId(active);
  }
}

export function isZoomed(): boolean {
  return zoomedPaneId() !== null;
}

// --- Operations ---

export function createPane(cwd: string, opts?: { agent?: string; effort?: string; prompt?: string }): string {
  const id = crypto.randomUUID();
  setPanes(id, { id, cwd, paneType: "terminal", agent: opts?.agent, effort: opts?.effort, prompt: opts?.prompt });
  if (!layout()) setLayout({ type: "leaf", paneId: id });
  setActivePaneId(id);
  return id;
}

export function findViewerPaneByPath(filePath: string): string | null {
  const leafIds = getLeafPaneIds();
  for (const id of leafIds) {
    const p = panes[id];
    if (p && p.paneType === "viewer" && p.filePath === filePath) {
      return id;
    }
  }
  return null;
}

export function createViewerPane(filePath: string, viewerType: ViewerType, cwd?: string): string {
  // If a viewer for this file already exists, focus it instead
  const existing = findViewerPaneByPath(filePath);
  if (existing) {
    setActivePaneId(existing);
    return existing;
  }

  const id = crypto.randomUUID();
  const dir = cwd || filePath.substring(0, filePath.lastIndexOf("/")) || "/";
  const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
  setPanes(id, { id, cwd: dir, paneType: "viewer", viewerType, filePath, fileLabel: fileName });

  const currentLayout = layout();
  if (!currentLayout) {
    setLayout({ type: "leaf", paneId: id });
  } else {
    // Split the active pane to add the viewer beside it
    const active = activePaneId();
    if (active) {
      const splitId = crypto.randomUUID();
      setLayout((prev) =>
        prev
          ? replaceLeaf(prev, active, {
              type: "split",
              id: splitId,
              direction: "vertical",
              first: { type: "leaf", paneId: active },
              second: { type: "leaf", paneId: id },
              ratio: 0.5,
            })
          : { type: "leaf", paneId: id },
      );
    } else {
      setLayout({ type: "leaf", paneId: id });
    }
  }
  setActivePaneId(id);
  return id;
}

export function setPaneCwd(paneId: string, cwd: string) {
  setPanes(paneId, "cwd", cwd);
}

export function splitPane(direction: "horizontal" | "vertical") {
  const active = activePaneId();
  if (!active) return;
  const cwd = panes[active]?.cwd || "";
  const newId = crypto.randomUUID();
  const splitId = crypto.randomUUID();
  setPanes(newId, { id: newId, cwd, paneType: "terminal" });
  setLayout((prev) =>
    prev
      ? replaceLeaf(prev, active, {
          type: "split",
          id: splitId,
          direction,
          first: { type: "leaf", paneId: active },
          second: { type: "leaf", paneId: newId },
          ratio: 0.5,
        })
      : prev,
  );
  setActivePaneId(newId);
}

export function closePane(paneId: string) {
  if (zoomedPaneId() === paneId) setZoomedPaneId(null);
  setPanes(produce((p) => { delete p[paneId]; }));
  setLayout((prev) => (prev ? removeLeaf(prev, paneId) : null));
  if (activePaneId() === paneId) {
    const remaining = getLeafPaneIds();
    setActivePaneId(remaining.length > 0 ? remaining[0] : "");
  }
}

export function updateSplitRatio(splitId: string, ratio: number) {
  const clamped = Math.max(0.15, Math.min(0.85, ratio));
  setLayout((prev) => (prev ? setRatioById(prev, splitId, clamped) : prev));
}

export function swapPanes(paneIdA: string, paneIdB: string) {
  if (paneIdA === paneIdB) return;
  setLayout((prev) => (prev ? swapLeaves(prev, paneIdA, paneIdB) : prev));
}

// --- Session Persistence ---

interface SessionPaneData {
  cwd: string;
  paneType?: PaneType;
  viewerType?: ViewerType;
  filePath?: string;
  fileLabel?: string;
}

interface SessionData {
  layout: LayoutNode | null;
  panes: Record<string, SessionPaneData>;
  activePaneId: string;
}

export async function saveSession(): Promise<void> {
  const currentLayout = layout();
  const leafIds = getLeafPaneIds(currentLayout);
  const paneData: Record<string, SessionPaneData> = {};
  for (const id of leafIds) {
    const p = panes[id];
    if (p) paneData[id] = {
      cwd: p.cwd,
      paneType: p.paneType,
      viewerType: p.viewerType,
      filePath: p.filePath,
      fileLabel: p.fileLabel,
    };
  }
  const data: SessionData = {
    layout: currentLayout,
    panes: paneData,
    activePaneId: activePaneId(),
  };
  try {
    await invoke("save_session", { data: JSON.stringify(data) });
  } catch {
    // Best-effort save — don't disturb the user on quit
  }
}

export async function restoreSession(): Promise<boolean> {
  try {
    const raw = await invoke<string | null>("load_session");
    if (!raw) return false;
    const data: SessionData = JSON.parse(raw);
    if (!data.layout) return false;

    // Validate: ensure all leaf pane IDs have corresponding pane data
    const leafIds = getLeafPaneIds(data.layout);
    if (leafIds.length === 0) return false;

    // Validate: ensure all pane cwds exist (gracefully skip invalid ones)
    for (const id of leafIds) {
      const paneInfo = data.panes[id];
      const cwd = paneInfo?.cwd || "";
      setPanes(id, {
        id,
        cwd,
        paneType: paneInfo?.paneType || "terminal",
        viewerType: paneInfo?.viewerType,
        filePath: paneInfo?.filePath,
        fileLabel: paneInfo?.fileLabel,
      });
    }

    setLayout(data.layout);
    if (data.activePaneId && leafIds.includes(data.activePaneId)) {
      setActivePaneId(data.activePaneId);
    } else {
      setActivePaneId(leafIds[0]);
    }
    return true;
  } catch {
    return false;
  }
}

// --- Workspaces ---

interface WorkspacePaneData {
  cwd: string;
  agent?: string;
  paneType?: PaneType;
  viewerType?: ViewerType;
  filePath?: string;
  fileLabel?: string;
}

interface WorkspaceData {
  layout: LayoutNode | null;
  panes: Record<string, WorkspacePaneData>;
}

function captureWorkspace(): WorkspaceData {
  const currentLayout = layout();
  const leafIds = getLeafPaneIds(currentLayout);
  const paneData: Record<string, WorkspacePaneData> = {};
  for (const id of leafIds) {
    const p = panes[id];
    if (p) paneData[id] = {
      cwd: p.cwd,
      agent: p.agent,
      paneType: p.paneType,
      viewerType: p.viewerType,
      filePath: p.filePath,
      fileLabel: p.fileLabel,
    };
  }
  return { layout: currentLayout, panes: paneData };
}

export async function saveWorkspace(name: string): Promise<void> {
  const data = captureWorkspace();
  await invoke("save_workspace", { name, data: JSON.stringify(data) });
}

export async function loadWorkspace(name: string): Promise<boolean> {
  const raw = await invoke<string | null>("load_workspace", { name });
  if (!raw) return false;
  const data: WorkspaceData = JSON.parse(raw);
  if (!data.layout) return false;

  // Close all existing panes
  const currentIds = getLeafPaneIds();
  for (const id of currentIds) {
    setPanes(produce((p) => { delete p[id]; }));
  }

  // Load workspace panes
  const leafIds = getLeafPaneIds(data.layout);
  if (leafIds.length === 0) return false;

  for (const id of leafIds) {
    const paneInfo = data.panes[id];
    setPanes(id, {
      id,
      cwd: paneInfo?.cwd || "",
      paneType: paneInfo?.paneType || "terminal",
      agent: paneInfo?.agent,
      viewerType: paneInfo?.viewerType,
      filePath: paneInfo?.filePath,
      fileLabel: paneInfo?.fileLabel,
    });
  }

  setLayout(data.layout);
  setZoomedPaneId(null);
  setActivePaneId(leafIds[0]);
  return true;
}

export async function listWorkspaces(): Promise<string[]> {
  return invoke<string[]>("list_workspaces");
}

export async function deleteWorkspace(name: string): Promise<void> {
  await invoke("delete_workspace", { name });
}

// --- Helpers ---

function replaceLeaf(node: LayoutNode, paneId: string, replacement: LayoutNode): LayoutNode {
  if (node.type === "leaf") return node.paneId === paneId ? replacement : node;
  return {
    ...node,
    first: replaceLeaf(node.first, paneId, replacement),
    second: replaceLeaf(node.second, paneId, replacement),
  };
}

function removeLeaf(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.type === "leaf") return node.paneId === paneId ? null : node;
  const first = removeLeaf(node.first, paneId);
  const second = removeLeaf(node.second, paneId);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function setRatioById(node: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (node.type === "leaf") return node;
  if (node.id === splitId) return { ...node, ratio };
  return {
    ...node,
    first: setRatioById(node.first, splitId, ratio),
    second: setRatioById(node.second, splitId, ratio),
  };
}

function swapLeaves(node: LayoutNode, idA: string, idB: string): LayoutNode {
  if (node.type === "leaf") {
    if (node.paneId === idA) return { type: "leaf", paneId: idB };
    if (node.paneId === idB) return { type: "leaf", paneId: idA };
    return node;
  }
  return {
    ...node,
    first: swapLeaves(node.first, idA, idB),
    second: swapLeaves(node.second, idA, idB),
  };
}
