import { createMemo } from "solid-js";

interface Props {
  content: string;
}

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldNum?: number;
  newNum?: number;
}

export default function DiffViewer(props: Props) {
  const lines = createMemo(() => parseDiff(props.content));

  return (
    <div class="diff-viewer">
      <table class="diff-table">
        <tbody>
          {lines().map((line) => (
            <tr class={`diff-line diff-line-${line.type}`}>
              <td class="diff-gutter diff-gutter-old">
                {line.oldNum ?? ""}
              </td>
              <td class="diff-gutter diff-gutter-new">
                {line.newNum ?? ""}
              </td>
              <td class="diff-marker">
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : line.type === "header" ? "" : " "}
              </td>
              <td class="diff-content">
                <pre>{line.content}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseDiff(raw: string): DiffLine[] {
  const lines = raw.split("\n");
  const result: DiffLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // Parse hunk header: @@ -a,b +c,d @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldNum = parseInt(match[1], 10);
        newNum = parseInt(match[2], 10);
      }
      result.push({ type: "header", content: line });
    } else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("+")) {
      result.push({ type: "add", content: line.substring(1), newNum });
      newNum++;
    } else if (line.startsWith("-")) {
      result.push({ type: "remove", content: line.substring(1), oldNum });
      oldNum++;
    } else {
      // Context line (may start with space or be empty)
      const content = line.startsWith(" ") ? line.substring(1) : line;
      if (line !== "") {
        result.push({ type: "context", content, oldNum, newNum });
        oldNum++;
        newNum++;
      }
    }
  }

  return result;
}
