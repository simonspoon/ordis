import { createResource, createSignal, Show } from "solid-js";
import { codeToHtml } from "shiki";

interface Props {
  code: string;
  lang: string;
}

export default function CodeBlock(props: Props) {
  const [copied, setCopied] = createSignal(false);

  const [html] = createResource(
    () => ({ code: props.code, lang: props.lang }),
    async ({ code, lang }) => {
      try {
        return await codeToHtml(code, {
          lang: lang || "text",
          theme: "github-dark",
        });
      } catch {
        // Fall back for unknown languages
        return await codeToHtml(code, { lang: "text", theme: "github-dark" });
      }
    },
  );

  const copyCode = async () => {
    await navigator.clipboard.writeText(props.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="code-block">
      <div class="code-header">
        <span class="code-lang">{props.lang || "text"}</span>
        <button class="copy-btn" onClick={copyCode}>
          {copied() ? "Copied" : "Copy"}
        </button>
      </div>
      <Show when={html()} fallback={<pre><code>{props.code}</code></pre>}>
        <div innerHTML={html()!} />
      </Show>
    </div>
  );
}
