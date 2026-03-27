import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";

// --- Types ---

export interface PaneState {
  id: string;
  cwd: string;
  agent?: string;
  prompt?: string;
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

// --- Operations ---

export function createPane(cwd: string, opts?: { agent?: string; prompt?: string }): string {
  const id = crypto.randomUUID();
  setPanes(id, { id, cwd, agent: opts?.agent, prompt: opts?.prompt });
  if (!layout()) setLayout({ type: "leaf", paneId: id });
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
  setPanes(newId, { id: newId, cwd });
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
