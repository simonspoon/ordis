import { createSignal } from "solid-js";
import { DividerInfo, updateSplitRatio } from "../lib/store";

interface Props {
  info: DividerInfo;
}

export default function SplitDivider(props: Props) {
  const [dragging, setDragging] = createSignal(false);

  const onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);

    const container = (e.target as HTMLElement).closest(".terminal-container")!;
    const bounds = container.getBoundingClientRect();

    // Transparent overlay prevents terminals from capturing mouse during drag
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;z-index:9999;cursor:${
      props.info.direction === "vertical" ? "col-resize" : "row-resize"
    }`;
    document.body.appendChild(overlay);

    const onMove = (e: MouseEvent) => {
      const { splitRect, direction } = props.info;
      const ratio =
        direction === "vertical"
          ? ((e.clientX - bounds.left) / bounds.width - splitRect.x) / splitRect.w
          : ((e.clientY - bounds.top) / bounds.height - splitRect.y) / splitRect.h;
      updateSplitRatio(props.info.splitId, ratio);
    };

    const onUp = () => {
      setDragging(false);
      overlay.remove();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      class={`split-divider split-divider-${props.info.direction} ${
        dragging() ? "split-divider-active" : ""
      }`}
      style={
        props.info.direction === "vertical"
          ? {
              left: `${props.info.x * 100}%`,
              top: `${props.info.y * 100}%`,
              height: `${props.info.length * 100}%`,
            }
          : {
              left: `${props.info.x * 100}%`,
              top: `${props.info.y * 100}%`,
              width: `${props.info.length * 100}%`,
            }
      }
      onMouseDown={onMouseDown}
    />
  );
}
