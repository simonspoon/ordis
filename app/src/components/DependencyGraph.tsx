import { createMemo, createSignal, onMount, onCleanup, For, Show } from "solid-js";
import dagre from "dagre";
import {
  getActiveProjectState,
  getTaskTree,
  selectedTaskId, setSelectedTaskId,
  type Task,
} from "../lib/tasks";

// --- Types ---

interface NodeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  task: Task;
  isCritical: boolean;
}

interface EdgeLayout {
  from: string;
  to: string;
  points: { x: number; y: number }[];
  isCritical: boolean;
}

interface GraphLayout {
  nodes: NodeLayout[];
  edges: EdgeLayout[];
  width: number;
  height: number;
}

// --- Graph Computation ---

function statusColor(status: string): string {
  switch (status) {
    case "in-progress": return "#7c5cbf";
    case "done": return "#4ade80";
    default: return "#6b7280";
  }
}

function statusTextColor(status: string): string {
  switch (status) {
    case "done": return "#166534";
    default: return "#e0e0e0";
  }
}

/**
 * Find the critical path: the longest path through incomplete tasks.
 * Uses DFS from all source nodes, measuring by edge count.
 */
function findCriticalPath(tasks: Task[]): Set<string> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  // Build adjacency: blocker -> blocked
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.blockedBy) {
      for (const blockerId of t.blockedBy) {
        if (taskMap.has(blockerId)) {
          const list = adj.get(blockerId) || [];
          list.push(t.id);
          adj.set(blockerId, list);
        }
      }
    }
  }

  // Find source nodes (no incoming edges among incomplete tasks)
  const hasIncoming = new Set<string>();
  for (const t of tasks) {
    if (t.status !== "done" && t.blockedBy) {
      for (const bid of t.blockedBy) {
        if (taskMap.has(bid) && taskMap.get(bid)!.status !== "done") {
          hasIncoming.add(t.id);
        }
      }
    }
  }

  const sources = tasks.filter(
    (t) => t.status !== "done" && !hasIncoming.has(t.id)
  );

  // DFS to find longest path (only through non-done tasks)
  let longestPath: string[] = [];

  function dfs(nodeId: string, path: string[]) {
    const current = [...path, nodeId];
    if (current.length > longestPath.length) {
      longestPath = current;
    }
    const neighbors = adj.get(nodeId) || [];
    for (const next of neighbors) {
      if (taskMap.get(next)?.status !== "done" && !path.includes(next)) {
        dfs(next, current);
      }
    }
  }

  for (const src of sources) {
    dfs(src.id, []);
  }

  return new Set(longestPath);
}

function computeGraphLayout(tasks: Task[]): GraphLayout | null {
  if (tasks.length === 0) return null;

  // Only include tasks that participate in dependency relationships
  const involved = new Set<string>();
  for (const t of tasks) {
    if (t.blockedBy && t.blockedBy.length > 0) {
      involved.add(t.id);
      for (const bid of t.blockedBy) {
        involved.add(bid);
      }
    }
  }

  // If no dependency relationships, show all tasks in a simple layout
  const graphTasks = involved.size > 0
    ? tasks.filter((t) => involved.has(t.id))
    : tasks;

  if (graphTasks.length === 0) return null;

  const criticalIds = findCriticalPath(tasks);

  // Build dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: 40,
    ranksep: 60,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const NODE_W = 180;
  const NODE_H = 50;

  for (const t of graphTasks) {
    g.setNode(t.id, { width: NODE_W, height: NODE_H });
  }

  // Edges: from blocker to blocked
  const edgePairs: [string, string][] = [];
  for (const t of graphTasks) {
    if (t.blockedBy) {
      for (const blockerId of t.blockedBy) {
        if (graphTasks.some((gt) => gt.id === blockerId)) {
          g.setEdge(blockerId, t.id);
          edgePairs.push([blockerId, t.id]);
        }
      }
    }
  }

  dagre.layout(g);

  const nodes: NodeLayout[] = graphTasks.map((t) => {
    const n = g.node(t.id);
    return {
      id: t.id,
      x: n.x - NODE_W / 2,
      y: n.y - NODE_H / 2,
      width: NODE_W,
      height: NODE_H,
      task: t,
      isCritical: criticalIds.has(t.id),
    };
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const edges: EdgeLayout[] = edgePairs.map(([from, to]) => {
    const edge = g.edge(from, to);
    const isCritical = criticalIds.has(from) && criticalIds.has(to);
    // Use dagre edge points if available, otherwise connect node centers
    const points = edge?.points || [
      { x: (nodeMap.get(from)?.x || 0) + NODE_W / 2, y: (nodeMap.get(from)?.y || 0) + NODE_H },
      { x: (nodeMap.get(to)?.x || 0) + NODE_W / 2, y: nodeMap.get(to)?.y || 0 },
    ];
    return { from, to, points, isCritical };
  });

  const graphMeta = g.graph();
  return {
    nodes,
    edges,
    width: (graphMeta.width || 600) + 40,
    height: (graphMeta.height || 400) + 40,
  };
}

// --- Component ---

export default function DependencyGraph() {
  let svgRef: SVGSVGElement | undefined;
  const [viewBox, setViewBox] = createSignal({ x: 0, y: 0, w: 800, h: 600 });
  const [dragging, setDragging] = createSignal(false);
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });

  // Collect tasks from the active project
  const allTasks = createMemo(() => {
    const state = getActiveProjectState();
    if (!state || !state.project.has_limbo) return [];
    const tasks: { projectName: string; task: Task }[] = [];
    for (const t of getTaskTree(state.project.name)) {
      tasks.push({ projectName: state.project.name, task: t });
    }
    return tasks;
  });

  const flatTasks = createMemo(() => allTasks().map((t) => t.task));

  const graphLayout = createMemo(() => computeGraphLayout(flatTasks()));

  // Fit viewBox to graph on layout change
  const fittedViewBox = createMemo(() => {
    const layout = graphLayout();
    if (!layout) return { x: 0, y: 0, w: 800, h: 600 };
    return {
      x: -20,
      y: -20,
      w: layout.width + 40,
      h: layout.height + 40,
    };
  });

  onMount(() => {
    setViewBox(fittedViewBox());
  });

  // Reset viewBox when graph changes substantially
  createMemo(() => {
    const fitted = fittedViewBox();
    setViewBox(fitted);
  });

  // Mouse wheel zoom
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const vb = viewBox();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const newW = vb.w * factor;
    const newH = vb.h * factor;
    // Zoom toward mouse position
    if (svgRef) {
      const rect = svgRef.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      setViewBox({
        x: vb.x + (vb.w - newW) * mx,
        y: vb.y + (vb.h - newH) * my,
        w: newW,
        h: newH,
      });
    } else {
      setViewBox({
        x: vb.x + (vb.w - newW) / 2,
        y: vb.y + (vb.h - newH) / 2,
        w: newW,
        h: newH,
      });
    }
  };

  // Pan with mouse drag
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    // Only start drag on SVG background, not on nodes
    if ((e.target as Element).closest(".dep-graph-node")) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging() || !svgRef) return;
    const vb = viewBox();
    const rect = svgRef.getBoundingClientRect();
    const dx = ((e.clientX - dragStart().x) / rect.width) * vb.w;
    const dy = ((e.clientY - dragStart().y) / rect.height) * vb.h;
    setViewBox({ ...vb, x: vb.x - dx, y: vb.y - dy });
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  onMount(() => {
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);
  });

  onCleanup(() => {
    window.removeEventListener("mouseup", handleMouseUp);
    window.removeEventListener("mousemove", handleMouseMove);
  });

  const handleNodeClick = (taskId: string) => {
    // Find which project this task belongs to
    const entry = allTasks().find((t) => t.task.id === taskId);
    if (entry) {
      const sel = selectedTaskId();
      if (sel?.project === entry.projectName && sel?.taskId === taskId) {
        setSelectedTaskId(null);
      } else {
        setSelectedTaskId({ project: entry.projectName, taskId });
      }
    }
  };

  const vb = () => {
    const v = viewBox();
    return `${v.x} ${v.y} ${v.w} ${v.h}`;
  };

  // Build edge path as smooth curve
  const edgePath = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return "";
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }
    // Use dagre's points to build a smooth path
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  };

  // Reset zoom to fit
  const handleFitView = () => {
    setViewBox(fittedViewBox());
  };

  return (
    <div class="dep-graph-container">
      <Show when={graphLayout()} fallback={
        <div class="dep-graph-empty">
          <p>No dependency relationships found.</p>
          <p class="dep-graph-hint">Use blocked-by relationships between tasks to see the dependency graph.</p>
        </div>
      }>
        <div class="dep-graph-toolbar">
          <button class="dep-graph-fit-btn" onClick={handleFitView} title="Fit to view">
            Fit
          </button>
          <span class="dep-graph-legend">
            <span class="dep-graph-legend-item">
              <span class="dep-graph-legend-dot" style={{ background: "#6b7280" }} /> Todo
            </span>
            <span class="dep-graph-legend-item">
              <span class="dep-graph-legend-dot" style={{ background: "#7c5cbf" }} /> In Progress
            </span>
            <span class="dep-graph-legend-item">
              <span class="dep-graph-legend-dot" style={{ background: "#4ade80" }} /> Done
            </span>
            <span class="dep-graph-legend-item">
              <span class="dep-graph-legend-critical" /> Critical Path
            </span>
          </span>
        </div>
        <svg
          ref={svgRef}
          class="dep-graph-svg"
          viewBox={vb()}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          style={{ cursor: dragging() ? "grabbing" : "grab" }}
        >
          {/* Arrow marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
            <marker
              id="arrowhead-critical"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
            </marker>
          </defs>

          {/* Edges */}
          <For each={graphLayout()!.edges}>
            {(edge) => (
              <path
                d={edgePath(edge.points)}
                fill="none"
                stroke={edge.isCritical ? "#f59e0b" : "#4b5563"}
                stroke-width={edge.isCritical ? 2.5 : 1.5}
                stroke-dasharray={edge.isCritical ? "none" : "none"}
                marker-end={edge.isCritical ? "url(#arrowhead-critical)" : "url(#arrowhead)"}
              />
            )}
          </For>

          {/* Nodes */}
          <For each={graphLayout()!.nodes}>
            {(node) => {
              const isSelected = () => {
                const sel = selectedTaskId();
                return sel?.taskId === node.id;
              };
              return (
                <g
                  class="dep-graph-node"
                  onClick={() => handleNodeClick(node.id)}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx="6"
                    ry="6"
                    fill={statusColor(node.task.status)}
                    stroke={
                      isSelected()
                        ? "#e0e0e0"
                        : node.isCritical
                          ? "#f59e0b"
                          : "transparent"
                    }
                    stroke-width={isSelected() ? 2 : node.isCritical ? 2 : 0}
                    opacity={node.task.status === "done" ? 0.6 : 1}
                  />
                  <text
                    x={node.x + node.width / 2}
                    y={node.y + 20}
                    text-anchor="middle"
                    fill={statusTextColor(node.task.status)}
                    font-size="12"
                    font-weight="500"
                  >
                    {node.task.name.length > 20
                      ? node.task.name.slice(0, 18) + "..."
                      : node.task.name}
                  </text>
                  <text
                    x={node.x + node.width / 2}
                    y={node.y + 36}
                    text-anchor="middle"
                    fill={statusTextColor(node.task.status)}
                    font-size="10"
                    opacity="0.7"
                  >
                    {node.id}
                  </text>
                </g>
              );
            }}
          </For>
        </svg>
      </Show>
    </div>
  );
}
