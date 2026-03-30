import { createResource, Show } from "solid-js";

interface Props {
  content: string;
}

export default function MarkdownViewer(props: Props) {
  const [rendered] = createResource(
    () => props.content,
    async (content) => {
      const { marked } = await import("marked");
      const DOMPurify = (await import("dompurify")).default;

      marked.setOptions({
        gfm: true,
        breaks: true,
      });

      const raw = await marked.parse(content);
      return DOMPurify.sanitize(raw);
    },
  );

  return (
    <div class="markdown-viewer">
      <Show when={rendered.loading}>
        <div class="viewer-loading">Rendering...</div>
      </Show>
      <Show when={rendered.error}>
        <div class="viewer-error">Failed to render markdown</div>
      </Show>
      <Show when={rendered() && !rendered.loading}>
        <div class="markdown-body" innerHTML={rendered()!} />
      </Show>
    </div>
  );
}
