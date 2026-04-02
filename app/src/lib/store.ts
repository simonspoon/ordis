import { createSignal, batch } from "solid-js";
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
  activeSidebar?: string | null;
  activeOverlay?: string | null;
  pluginData?: Record<string, unknown>;
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

export interface WorkspaceTab {
  id: string;
  name: string;
  layout: LayoutNode | null;
  activePaneId: string;
  zoomedPaneId: string | null;
}

// --- State ---

export const [panes, setPanes] = createStore<Record<string, PaneState>>({});
export const [activePaneId, setActivePaneId] = createSignal("");
export const [layout, setLayout] = createSignal<LayoutNode | null>(null);
export const [zoomedPaneId, setZoomedPaneId] = createSignal<string | null>(null);

const defaultTabId = crypto.randomUUID();
export const [tabs, setTabs] = createSignal<WorkspaceTab[]>([
  { id: defaultTabId, name: "Main", layout: null, activePaneId: "", zoomedPaneId: null },
]);
export const [activeTabId, setActiveTabId] = createSignal(defaultTabId);

// --- Tab Sync ---

function saveCurrentTabState(): void {
  const tabId = activeTabId();
  setTabs(prev =>
    prev.map(t =>
      t.id === tabId
        ? { ...t, layout: layout(), activePaneId: activePaneId(), zoomedPaneId: zoomedPaneId() }
        : t,
    ),
  );
}

function loadTabState(tab: WorkspaceTab): void {
  setLayout(tab.layout);
  setActivePaneId(tab.activePaneId);
  setZoomedPaneId(tab.zoomedPaneId);
}

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

// --- Per-Pane Plugin State ---

export function getActivePaneSidebar(): string | null {
  const id = activePaneId();
  return id ? panes[id]?.activeSidebar ?? null : null;
}

export function setActivePaneSidebar(value: string | null): void {
  const id = activePaneId();
  if (id) setPanes(id, "activeSidebar", value);
}

export function getActivePaneOverlay(): string | null {
  const id = activePaneId();
  return id ? panes[id]?.activeOverlay ?? null : null;
}

export function setActivePaneOverlay(value: string | null): void {
  const id = activePaneId();
  if (id) setPanes(id, "activeOverlay", value);
}

export function getActivePanePluginData(): Record<string, unknown> {
  const id = activePaneId();
  return id ? panes[id]?.pluginData ?? {} : {};
}

export function setActivePanePluginData(data: Record<string, unknown>): void {
  const id = activePaneId();
  if (id) setPanes(id, "pluginData", { ...data });
}

// --- Operations ---

export function createPane(cwd: string, opts?: { agent?: string; effort?: string; prompt?: string }): string {
  const id = crypto.randomUUID();
  setPanes(id, { id, cwd, paneType: "terminal", agent: opts?.agent, effort: opts?.effort, prompt: opts?.prompt, activeSidebar: null, activeOverlay: null, pluginData: {} });
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
  setPanes(id, { id, cwd: dir, paneType: "viewer", viewerType, filePath, fileLabel: fileName, activeSidebar: null, activeOverlay: null, pluginData: {} });

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
  setPanes(newId, { id: newId, cwd, paneType: "terminal", activeSidebar: null, activeOverlay: null, pluginData: {} });
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
  batch(() => {
    if (zoomedPaneId() === paneId) setZoomedPaneId(null);
    setPanes(produce((p) => { delete p[paneId]; }));
    setLayout((prev) => (prev ? removeLeaf(prev, paneId) : null));
    const remaining = getLeafPaneIds();
    if (activePaneId() === paneId) {
      setActivePaneId(remaining.length > 0 ? remaining[0] : "");
    }
    // If tab is now empty, auto-spawn a fresh session
    if (remaining.length === 0) {
      createPane("");
    }
  });
}

export function updateSplitRatio(splitId: string, ratio: number) {
  const clamped = Math.max(0.15, Math.min(0.85, ratio));
  setLayout((prev) => (prev ? setRatioById(prev, splitId, clamped) : prev));
}

export function swapPanes(paneIdA: string, paneIdB: string) {
  if (paneIdA === paneIdB) return;
  setLayout((prev) => (prev ? swapLeaves(prev, paneIdA, paneIdB) : prev));
}

// --- Tab Management ---

export function createTab(name: string, cwd: string): string {
  const tabId = crypto.randomUUID();
  const paneId = crypto.randomUUID();

  batch(() => {
    saveCurrentTabState();

    setPanes(paneId, {
      id: paneId,
      cwd,
      paneType: "terminal",
      activeSidebar: null,
      activeOverlay: null,
      pluginData: {},
    });

    const newTab: WorkspaceTab = {
      id: tabId,
      name,
      layout: { type: "leaf", paneId },
      activePaneId: paneId,
      zoomedPaneId: null,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);
    loadTabState(newTab);
  });

  return tabId;
}

export function switchTab(tabId: string): void {
  if (tabId === activeTabId()) return;
  const target = tabs().find(t => t.id === tabId);
  if (!target) return;

  batch(() => {
    saveCurrentTabState();
    setActiveTabId(tabId);
    loadTabState(target);
  });
}

export function closeTab(tabId: string): void {
  const allTabs = tabs();
  if (allTabs.length <= 1) return;

  const tabToClose = allTabs.find(t => t.id === tabId);
  if (!tabToClose) return;

  const leafIds = getLeafPaneIds(tabToClose.layout);

  batch(() => {
    // Remove all panes owned by this tab
    for (const id of leafIds) {
      setPanes(produce(p => { delete p[id]; }));
    }

    // If closing active tab, switch to adjacent first
    if (tabId === activeTabId()) {
      const idx = allTabs.findIndex(t => t.id === tabId);
      const nextTab = allTabs[idx + 1] || allTabs[idx - 1];
      setActiveTabId(nextTab.id);
      loadTabState(nextTab);
    }

    setTabs(prev => prev.filter(t => t.id !== tabId));
  });
}

export function renameTab(tabId: string, name: string): void {
  setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, name } : t)));
}

export function getActiveTabId(): string {
  return activeTabId();
}

export function getTabs(): WorkspaceTab[] {
  return tabs();
}

// --- Session Persistence ---

interface SessionPaneData {
  cwd: string;
  paneType?: PaneType;
  viewerType?: ViewerType;
  filePath?: string;
  fileLabel?: string;
  activeSidebar?: string | null;
  activeOverlay?: string | null;
  pluginData?: Record<string, unknown>;
}

interface SessionData {
  layout: LayoutNode | null;
  panes: Record<string, SessionPaneData>;
  activePaneId: string;
  tabs?: WorkspaceTab[];
  activeTabId?: string;
}

export async function saveSession(): Promise<void> {
  // Ensure active tab has latest signal values
  saveCurrentTabState();

  const allTabs = tabs();

  // Collect pane data for all tabs
  const paneData: Record<string, SessionPaneData> = {};
  for (const tab of allTabs) {
    const leafIds = getLeafPaneIds(tab.layout);
    for (const id of leafIds) {
      const p = panes[id];
      if (p) paneData[id] = {
        cwd: p.cwd,
        paneType: p.paneType,
        viewerType: p.viewerType,
        filePath: p.filePath,
        fileLabel: p.fileLabel,
        activeSidebar: p.activeSidebar,
        activeOverlay: p.activeOverlay,
        pluginData: p.pluginData,
      };
    }
  }

  // Backward-compatible: top-level layout/activePaneId from the active tab
  const data: SessionData = {
    layout: layout(),
    panes: paneData,
    activePaneId: activePaneId(),
    tabs: allTabs,
    activeTabId: activeTabId(),
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

    if (data.tabs && data.tabs.length > 0) {
      // New format: restore all tabs
      return restoreSessionTabs(data);
    }

    // Legacy format: wrap in single default tab
    return restoreSessionLegacy(data);
  } catch {
    return false;
  }
}

function restoreTabLayout(
  tabLayout: LayoutNode | null,
  paneData: Record<string, SessionPaneData>,
): { layout: LayoutNode | null; activePaneIds: string[] } {
  if (!tabLayout) return { layout: null, activePaneIds: [] };

  const leafIds = getLeafPaneIds(tabLayout);
  if (leafIds.length === 0) return { layout: null, activePaneIds: [] };

  const skippedIds: string[] = [];
  for (const id of leafIds) {
    const paneInfo = paneData[id];
    if (paneInfo?.paneType === "viewer") {
      skippedIds.push(id);
      continue;
    }
    const cwd = paneInfo?.cwd || "";
    setPanes(id, {
      id,
      cwd,
      paneType: paneInfo?.paneType || "terminal",
      viewerType: paneInfo?.viewerType,
      filePath: paneInfo?.filePath,
      fileLabel: paneInfo?.fileLabel,
      activeSidebar: paneInfo?.activeSidebar ?? null,
      activeOverlay: paneInfo?.activeOverlay ?? null,
      pluginData: paneInfo?.pluginData ? { ...paneInfo.pluginData } : {},
    });
  }

  let cleanedLayout: LayoutNode | null = tabLayout;
  for (const id of skippedIds) {
    cleanedLayout = cleanedLayout ? removeLeaf(cleanedLayout, id) : null;
  }

  const remainingIds = cleanedLayout ? getLeafPaneIds(cleanedLayout) : [];
  return { layout: cleanedLayout, activePaneIds: remainingIds };
}

function restoreSessionTabs(data: SessionData): boolean {
  const restoredTabs: WorkspaceTab[] = [];

  for (const tab of data.tabs!) {
    const { layout: cleanedLayout, activePaneIds } = restoreTabLayout(
      tab.layout,
      data.panes,
    );
    if (!cleanedLayout || activePaneIds.length === 0) continue;

    const restoredActivePaneId =
      tab.activePaneId && activePaneIds.includes(tab.activePaneId)
        ? tab.activePaneId
        : activePaneIds[0];

    restoredTabs.push({
      id: tab.id,
      name: tab.name,
      layout: cleanedLayout,
      activePaneId: restoredActivePaneId,
      zoomedPaneId: null,
    });
  }

  if (restoredTabs.length === 0) return false;

  setTabs(restoredTabs);

  // Find the active tab to restore
  const savedActiveTabId = data.activeTabId;
  const activeTab =
    restoredTabs.find(t => t.id === savedActiveTabId) || restoredTabs[0];
  setActiveTabId(activeTab.id);
  loadTabState(activeTab);

  return true;
}

function restoreSessionLegacy(data: SessionData): boolean {
  if (!data.layout) return false;

  const { layout: cleanedLayout, activePaneIds } = restoreTabLayout(
    data.layout,
    data.panes,
  );
  if (!cleanedLayout || activePaneIds.length === 0) return false;

  const restoredActivePaneId =
    data.activePaneId && activePaneIds.includes(data.activePaneId)
      ? data.activePaneId
      : activePaneIds[0];

  // Wrap in a single default tab
  const tabId = crypto.randomUUID();
  const tab: WorkspaceTab = {
    id: tabId,
    name: "Main",
    layout: cleanedLayout,
    activePaneId: restoredActivePaneId,
    zoomedPaneId: null,
  };

  setTabs([tab]);
  setActiveTabId(tabId);
  loadTabState(tab);

  return true;
}

// --- Layouts ---

interface LayoutPaneData {
  cwd: string;
  agent?: string;
  paneType?: PaneType;
  viewerType?: ViewerType;
  filePath?: string;
  fileLabel?: string;
  activeSidebar?: string | null;
  activeOverlay?: string | null;
  pluginData?: Record<string, unknown>;
}

interface LayoutData {
  layout: LayoutNode | null;
  panes: Record<string, LayoutPaneData>;
}

function captureLayout(): LayoutData {
  const currentLayout = layout();
  const leafIds = getLeafPaneIds(currentLayout);
  const paneData: Record<string, LayoutPaneData> = {};
  for (const id of leafIds) {
    const p = panes[id];
    if (p) paneData[id] = {
      cwd: p.cwd,
      agent: p.agent,
      paneType: p.paneType,
      viewerType: p.viewerType,
      filePath: p.filePath,
      fileLabel: p.fileLabel,
      activeSidebar: p.activeSidebar,
      activeOverlay: p.activeOverlay,
      pluginData: p.pluginData,
    };
  }
  return { layout: currentLayout, panes: paneData };
}

export async function saveLayout(name: string): Promise<void> {
  const data = captureLayout();
  await invoke("save_layout", { name, data: JSON.stringify(data) });
}

export async function loadLayout(name: string): Promise<boolean> {
  const raw = await invoke<string | null>("load_layout", { name });
  if (!raw) return false;
  const data: LayoutData = JSON.parse(raw);
  if (!data.layout) return false;

  // Close all existing panes
  const currentIds = getLeafPaneIds();
  for (const id of currentIds) {
    setPanes(produce((p) => { delete p[id]; }));
  }

  // Load layout panes, skipping viewer panes (now handled by overlay plugin)
  const leafIds = getLeafPaneIds(data.layout);
  if (leafIds.length === 0) return false;

  const skippedIds: string[] = [];
  for (const id of leafIds) {
    const paneInfo = data.panes[id];
    if (paneInfo?.paneType === "viewer") {
      skippedIds.push(id);
      continue;
    }
    setPanes(id, {
      id,
      cwd: paneInfo?.cwd || "",
      paneType: paneInfo?.paneType || "terminal",
      agent: paneInfo?.agent,
      viewerType: paneInfo?.viewerType,
      filePath: paneInfo?.filePath,
      fileLabel: paneInfo?.fileLabel,
      activeSidebar: paneInfo?.activeSidebar ?? null,
      activeOverlay: paneInfo?.activeOverlay ?? null,
      pluginData: paneInfo?.pluginData ? { ...paneInfo.pluginData } : {},
    });
  }

  // Remove skipped viewer panes from layout
  let cleanedLayout: LayoutNode | null = data.layout;
  for (const id of skippedIds) {
    cleanedLayout = cleanedLayout ? removeLeaf(cleanedLayout, id) : null;
  }
  if (!cleanedLayout) return false;

  const remainingIds = getLeafPaneIds(cleanedLayout);
  if (remainingIds.length === 0) return false;

  setLayout(cleanedLayout);
  setZoomedPaneId(null);
  setActivePaneId(remainingIds[0]);

  // Keep the active tab's stored state in sync
  saveCurrentTabState();

  return true;
}

export async function listLayouts(): Promise<string[]> {
  return invoke<string[]>("list_layouts");
}

export async function deleteLayout(name: string): Promise<void> {
  await invoke("delete_layout", { name });
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
