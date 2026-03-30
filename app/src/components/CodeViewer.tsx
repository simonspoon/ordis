import { createResource, Show } from "solid-js";

interface Props {
  content: string;
  extension: string;
  lineWrap: boolean;
}

export default function CodeViewer(props: Props) {
  // Shiki syntax highlighting (async, lazy loaded)
  const [highlighted] = createResource(
    () => ({ content: props.content, ext: props.extension }),
    async ({ content, ext }) => {
      try {
        const { codeToHtml } = await import("shiki");
        const lang = mapExtToLang(ext);
        return await codeToHtml(content, {
          lang,
          theme: "github-dark",
        });
      } catch {
        // Fallback: plain text with line numbers
        return null;
      }
    },
  );

  return (
    <div class={`code-viewer ${props.lineWrap ? "code-viewer-wrap" : ""}`}>
      <Show
        when={highlighted()}
        fallback={
          <pre class="code-viewer-plain">
            <code>{props.content}</code>
          </pre>
        }
      >
        <div class="code-viewer-highlighted" innerHTML={highlighted()!} />
      </Show>
    </div>
  );
}

function mapExtToLang(ext: string): string {
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    rs: "rust",
    py: "python",
    go: "go",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    java: "java",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    toml: "toml",
    yaml: "yaml",
    yml: "yaml",
    json: "json",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    sql: "sql",
    lua: "lua",
    r: "r",
    php: "php",
    pl: "perl",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    ml: "ocaml",
    clj: "clojure",
    scala: "scala",
    zig: "zig",
    nim: "nim",
    cs: "csharp",
    fs: "fsharp",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
    tf: "hcl",
    hcl: "hcl",
    nix: "nix",
    dockerfile: "dockerfile",
    makefile: "makefile",
    cmake: "cmake",
    md: "markdown",
    mdx: "mdx",
    txt: "text",
    log: "text",
    csv: "csv",
    diff: "diff",
    patch: "diff",
    ini: "ini",
    conf: "ini",
    cfg: "ini",
    env: "dotenv",
    lock: "text",
    gradle: "groovy",
    d: "d",
    v: "v",
  };
  return map[ext.toLowerCase()] || "text";
}
