import { createMemo, createSignal, onMount, onCleanup, For, Show } from "solid-js";
import {
  getActiveProjectState,
  getTaskTree,
  selectedTaskId, setSelectedTaskId,
  type Task,
} from "../lib/tasks";

// --- Types ---

interface TimelineRow {
  task: Task;
  project: string;
  depth: number;
  startMs: number;
  endMs: number;
}

interface TooltipData {
  x: number;
  y: number;
  task: Task;
  startMs: number;
  endMs: number;
}

// --- Helpers ---

function statusBarColor(status: string): string {
  switch (status) {
    case "in-progress": return "#7c5cbf";
    case "done": return "#4ade80";
    default: return "#6b7280";
  }
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
}

function parseTimestamp(ts: string | undefined): number | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? null : ms;
}

// --- Component ---

export default function TaskTimeline() {
  let svgRef: SVGSVGElement | undefined;
  let scrollRef: HTMLDivElement | undefined;
  const [tooltip, setTooltip] = createSignal<TooltipData | null>(null);
  const [viewStart, setViewStart] = createSignal(0);
  const [viewEnd, setViewEnd] = createSignal(0);
  const [zoomLevel, setZoomLevel] = createSignal(1);

  const ROW_HEIGHT = 32;
  const LABEL_WIDTH = 200;
  const BAR_HEIGHT = 20;
  const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
  const HEADER_HEIGHT = 30;
  const MIN_BAR_WIDTH = 6;

  // Build flat list of timeline rows from the active project
  const rows = createMemo((): TimelineRow[] => {
    const result: TimelineRow[] = [];
    const state = getActiveProjectState();
    if (!state || !state.project.has_limbo) return result;

    const tasks = getTaskTree(state.project.name);
    if (tasks.length === 0) return result;

    // Build parent-child map
    const childMap = new Map<string, Task[]>();
    const roots: Task[] = [];
    for (const t of tasks) {
      if (!t.parent) {
        roots.push(t);
      } else {
        const siblings = childMap.get(t.parent) || [];
        siblings.push(t);
        childMap.set(t.parent, siblings);
      }
    }

    // DFS to flatten with depth
    const visit = (task: Task, depth: number) => {
      const startMs = parseTimestamp(task.created);
      if (startMs === null) return; // Skip tasks without created timestamp
      const endMs = parseTimestamp(task.updated) || Date.now();
      result.push({
        task,
        project: state.project.name,
        depth,
        startMs,
        endMs: Math.max(endMs, startMs + 60000), // minimum 1 minute span
      });
      const children = childMap.get(task.id) || [];
      for (const child of children) {
        visit(child, depth + 1);
      }
    };

    for (const root of roots) {
      visit(root, 0);
    }

    return result;
  });

  // Compute time range
  const timeRange = createMemo(() => {
    const r = rows();
    if (r.length === 0) return { min: Date.now() - 86400000, max: Date.now() };
    let min = Infinity;
    let max = -Infinity;
    for (const row of r) {
      if (row.startMs < min) min = row.startMs;
      if (row.endMs > max) max = row.endMs;
    }
    // Add 5% padding on each side
    const span = max - min || 86400000;
    return { min: min - span * 0.05, max: max + span * 0.05 };
  });

  // Auto-fit on first render
  onMount(() => {
    autoFit();
  });

  const autoFit = () => {
    const range = timeRange();
    setViewStart(range.min);
    setViewEnd(range.max);
    setZoomLevel(1);
  };

  // Compute timeline width based on zoom
  const timelineWidth = createMemo(() => {
    if (!scrollRef) return 800;
    return Math.max(scrollRef.clientWidth, scrollRef.clientWidth * zoomLevel());
  });

  // Map time to X position within the scrollable area
  const timeToX = (ms: number): number => {
    const start = viewStart();
    const end = viewEnd();
    const span = end - start;
    if (span <= 0) return 0;
    return ((ms - start) / span) * timelineWidth();
  };

  // Generate time axis ticks
  const ticks = createMemo(() => {
    const start = viewStart();
    const end = viewEnd();
    const span = end - start;
    if (span <= 0) return [];

    // Choose tick interval based on span
    const targetTickCount = Math.max(4, Math.min(20, Math.floor(timelineWidth() / 100)));
    const rawInterval = span / targetTickCount;

    // Snap to nice intervals
    const intervals = [
      3600000,       // 1 hour
      21600000,      // 6 hours
      43200000,      // 12 hours
      86400000,      // 1 day
      604800000,     // 1 week
      2592000000,    // 30 days
    ];
    let interval = intervals[0];
    for (const iv of intervals) {
      if (iv >= rawInterval) { interval = iv; break; }
      interval = iv;
    }

    const result: { x: number; label: string }[] = [];
    const first = Math.ceil(start / interval) * interval;
    for (let t = first; t <= end; t += interval) {
      result.push({
        x: timeToX(t),
        label: formatDate(t),
      });
    }
    return result;
  });

  // Handle horizontal scroll via mouse wheel
  const handleWheel = (e: WheelEvent) => {
    if (e.deltaX !== 0) return; // natural horizontal scroll
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoomLevel((z) => Math.max(0.5, Math.min(10, z * factor)));
    } else {
      // Horizontal pan
      e.preventDefault();
      const span = viewEnd() - viewStart();
      const shift = (e.deltaY / timelineWidth()) * span * 0.3;
      setViewStart((s) => s + shift);
      setViewEnd((s) => s + shift);
    }
  };

  onMount(() => {
    const el = scrollRef;
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
      onCleanup(() => el.removeEventListener("wheel", handleWheel));
    }
  });

  const handleBarClick = (task: Task, project: string) => {
    const sel = selectedTaskId();
    if (sel?.project === project && sel?.taskId === task.id) {
      setSelectedTaskId(null);
    } else {
      setSelectedTaskId({ project, taskId: task.id });
    }
  };

  const handleBarMouseEnter = (e: MouseEvent, row: TimelineRow) => {
    const rect = (e.currentTarget as Element).closest(".timeline-scroll")?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 40,
      task: row.task,
      startMs: row.startMs,
      endMs: row.endMs,
    });
  };

  const svgHeight = createMemo(() => HEADER_HEIGHT + rows().length * ROW_HEIGHT + 10);

  return (
    <div class="timeline-container">
      <div class="timeline-toolbar">
        <button class="timeline-fit-btn" onClick={autoFit}>Fit All</button>
        <div class="timeline-legend">
          <div class="timeline-legend-item">
            <span class="timeline-legend-dot" style={{ background: "#6b7280" }} />
            <span>Todo</span>
          </div>
          <div class="timeline-legend-item">
            <span class="timeline-legend-dot" style={{ background: "#7c5cbf" }} />
            <span>In Progress</span>
          </div>
          <div class="timeline-legend-item">
            <span class="timeline-legend-dot" style={{ background: "#4ade80" }} />
            <span>Done</span>
          </div>
        </div>
      </div>
      <Show when={rows().length > 0} fallback={
        <div class="timeline-empty">
          <span>No tasks with timestamps to display</span>
          <span class="timeline-hint">Tasks need a 'created' timestamp to appear on the timeline</span>
        </div>
      }>
        <div class="timeline-body">
          {/* Fixed left label column */}
          <div class="timeline-labels" style={{ width: `${LABEL_WIDTH}px` }}>
            <div class="timeline-label-header" style={{ height: `${HEADER_HEIGHT}px` }}>Task</div>
            <For each={rows()}>
              {(row) => {
                const isSelected = () => {
                  const sel = selectedTaskId();
                  return sel?.project === row.project && sel?.taskId === row.task.id;
                };
                return (
                  <div
                    class="timeline-label-row"
                    classList={{ "timeline-label-row-selected": isSelected() }}
                    style={{
                      height: `${ROW_HEIGHT}px`,
                      "padding-left": `${8 + row.depth * 12}px`,
                    }}
                    onClick={() => handleBarClick(row.task, row.project)}
                  >
                    <span class="timeline-label-id">{row.task.id}</span>
                    <span class="timeline-label-name" title={row.task.name}>{row.task.name}</span>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Scrollable timeline area */}
          <div class="timeline-scroll" ref={scrollRef}>
            <svg
              ref={svgRef}
              width={timelineWidth()}
              height={svgHeight()}
              class="timeline-svg"
            >
              {/* Time axis */}
              <For each={ticks()}>
                {(tick) => (
                  <g>
                    <line
                      x1={tick.x} y1={HEADER_HEIGHT}
                      x2={tick.x} y2={svgHeight()}
                      stroke="rgba(255,255,255,0.06)"
                      stroke-width="1"
                    />
                    <text
                      x={tick.x} y={HEADER_HEIGHT - 8}
                      fill="#a0a0b0"
                      font-size="11"
                      text-anchor="middle"
                    >{tick.label}</text>
                  </g>
                )}
              </For>

              {/* Task bars */}
              <For each={rows()}>
                {(row, i) => {
                  const x = () => timeToX(row.startMs);
                  const w = () => Math.max(MIN_BAR_WIDTH, timeToX(row.endMs) - timeToX(row.startMs));
                  const y = () => HEADER_HEIGHT + i() * ROW_HEIGHT + BAR_Y_OFFSET;
                  const isSelected = () => {
                    const sel = selectedTaskId();
                    return sel?.project === row.project && sel?.taskId === row.task.id;
                  };
                  const barTextWidth = () => w() - 8;

                  return (
                    <g
                      class="timeline-bar-group"
                      style={{ cursor: "pointer" }}
                      onClick={() => handleBarClick(row.task, row.project)}
                      onMouseEnter={(e) => handleBarMouseEnter(e, row)}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {/* Background stripe */}
                      <rect
                        x={0} y={HEADER_HEIGHT + i() * ROW_HEIGHT}
                        width={timelineWidth()} height={ROW_HEIGHT}
                        fill={i() % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"}
                      />
                      {/* Bar */}
                      <rect
                        x={x()} y={y()}
                        width={w()} height={BAR_HEIGHT}
                        rx={4} ry={4}
                        fill={statusBarColor(row.task.status)}
                        opacity={isSelected() ? 1 : 0.8}
                        stroke={isSelected() ? "#fff" : "none"}
                        stroke-width={isSelected() ? 1.5 : 0}
                      />
                      {/* Bar label (only if bar is wide enough) */}
                      <Show when={barTextWidth() > 30}>
                        <text
                          x={x() + 6} y={y() + BAR_HEIGHT / 2 + 4}
                          fill={row.task.status === "done" ? "#166534" : "#e0e0e0"}
                          font-size="11"
                          clip-path={`inset(0 0 0 0)`}
                        >
                          {row.task.name.length > Math.floor(barTextWidth() / 7)
                            ? row.task.name.slice(0, Math.floor(barTextWidth() / 7)) + "..."
                            : row.task.name}
                        </text>
                      </Show>
                    </g>
                  );
                }}
              </For>
            </svg>

            {/* Tooltip */}
            <Show when={tooltip()}>
              {(tip) => (
                <div
                  class="timeline-tooltip"
                  style={{
                    left: `${tip().x}px`,
                    top: `${tip().y}px`,
                  }}
                >
                  <div class="timeline-tooltip-name">{tip().task.name}</div>
                  <div class="timeline-tooltip-row">
                    <span>Status:</span> <span>{tip().task.status}</span>
                  </div>
                  <div class="timeline-tooltip-row">
                    <span>Created:</span> <span>{formatDate(tip().startMs)}</span>
                  </div>
                  <div class="timeline-tooltip-row">
                    <span>Updated:</span> <span>{formatDate(tip().endMs)}</span>
                  </div>
                  <div class="timeline-tooltip-row">
                    <span>Duration:</span> <span>{formatDuration(tip().endMs - tip().startMs)}</span>
                  </div>
                </div>
              )}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
