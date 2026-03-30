import { createSignal } from "solid-js";

interface Props {
  content: string;  // data URI (base64 encoded)
  filePath: string;
}

export default function ImageViewer(props: Props) {
  const [scale, setScale] = createSignal(1);
  const [fitMode, setFitMode] = createSignal<"contain" | "actual">("contain");

  const fileName = () => props.filePath.split("/").pop() || "Image";

  const toggleFit = () => {
    if (fitMode() === "contain") {
      setFitMode("actual");
      setScale(1);
    } else {
      setFitMode("contain");
    }
  };

  const zoomIn = () => {
    setFitMode("actual");
    setScale((s) => Math.min(s * 1.25, 10));
  };

  const zoomOut = () => {
    setFitMode("actual");
    setScale((s) => Math.max(s * 0.8, 0.1));
  };

  return (
    <div class="image-viewer">
      <div class="image-viewer-controls">
        <button class="viewer-action" onClick={zoomOut} title="Zoom out">-</button>
        <span class="image-viewer-scale">
          {fitMode() === "contain" ? "Fit" : `${Math.round(scale() * 100)}%`}
        </span>
        <button class="viewer-action" onClick={zoomIn} title="Zoom in">+</button>
        <button class="viewer-action" onClick={toggleFit} title="Toggle fit mode">
          {fitMode() === "contain" ? "1:1" : "Fit"}
        </button>
      </div>
      <div class="image-viewer-canvas">
        <img
          src={props.content}
          alt={fileName()}
          class={`image-viewer-img ${fitMode() === "contain" ? "image-fit" : ""}`}
          style={fitMode() === "actual" ? { transform: `scale(${scale()})` } : {}}
          draggable={false}
        />
      </div>
    </div>
  );
}
