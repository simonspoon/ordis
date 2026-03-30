import { createSignal, onMount } from "solid-js";

interface Props {
  content: string;  // data URI (base64 encoded PDF)
}

export default function PdfViewer(props: Props) {
  const [currentPage, setCurrentPage] = createSignal(1);
  const [totalPages, setTotalPages] = createSignal(0);
  const [scale, setScale] = createSignal(1.5);
  const [error, setError] = createSignal<string | null>(null);
  let canvasRef!: HTMLCanvasElement;
  let pdfDoc: any = null;

  const loadPdf = async () => {
    try {
      // Dynamically import PDF.js
      const pdfjsLib = await import("pdfjs-dist");

      // Set worker source — use inline worker to avoid CSP issues
      pdfjsLib.GlobalWorkerOptions.workerSrc = "";

      // Decode the base64 data URI
      const base64 = props.content.replace(/^data:application\/pdf;base64,/, "");
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      pdfDoc = await loadingTask.promise;
      setTotalPages(pdfDoc.numPages);
      renderPage(1);
    } catch (e) {
      setError(`Failed to load PDF: ${e}`);
    }
  };

  const renderPage = async (num: number) => {
    if (!pdfDoc || !canvasRef) return;
    try {
      const page = await pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: scale() });
      canvasRef.width = viewport.width;
      canvasRef.height = viewport.height;
      const ctx = canvasRef.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
      setCurrentPage(num);
    } catch (e) {
      setError(`Failed to render page ${num}: ${e}`);
    }
  };

  const prevPage = () => {
    if (currentPage() > 1) renderPage(currentPage() - 1);
  };

  const nextPage = () => {
    if (currentPage() < totalPages()) renderPage(currentPage() + 1);
  };

  const zoomIn = () => {
    setScale((s) => Math.min(s + 0.25, 5));
    renderPage(currentPage());
  };

  const zoomOut = () => {
    setScale((s) => Math.max(s - 0.25, 0.5));
    renderPage(currentPage());
  };

  onMount(() => {
    loadPdf();
  });

  return (
    <div class="pdf-viewer">
      {error() ? (
        <div class="viewer-error">{error()}</div>
      ) : (
        <>
          <div class="pdf-viewer-controls">
            <button class="viewer-action" onClick={prevPage} disabled={currentPage() <= 1}>
              Prev
            </button>
            <span class="pdf-viewer-page">
              {currentPage()} / {totalPages() || "..."}
            </span>
            <button class="viewer-action" onClick={nextPage} disabled={currentPage() >= totalPages()}>
              Next
            </button>
            <span class="pdf-viewer-sep">|</span>
            <button class="viewer-action" onClick={zoomOut}>-</button>
            <span class="pdf-viewer-scale">{Math.round(scale() * 100)}%</span>
            <button class="viewer-action" onClick={zoomIn}>+</button>
          </div>
          <div class="pdf-viewer-canvas-container">
            <canvas ref={canvasRef} class="pdf-viewer-canvas" />
          </div>
        </>
      )}
    </div>
  );
}
