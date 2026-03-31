// --- ANSI Stripping ---

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

// --- Types ---

export interface ParsedToolOutput {
  filePath: string;
  operation: "created" | "edited" | "read" | "screenshot";
}

// --- Path Extraction ---

// Match absolute paths (Unix) — must start with / and contain at least one path segment
// Length cap at 512 chars to prevent pathological backtracking
const ABS_PATH_RE = /(\/[^\s:,;'")\]}>]{1,512})/;

// Match relative paths that look like file references (at least one / with extension or known dir prefix)
const REL_PATH_RE = /(?:^|\s)((?:\.\/|\.\.\/)?[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)/;

// System paths that should never be treated as artifacts
const DENY_PATH_PREFIXES = ["/dev/", "/proc/", "/sys/"];

// Known source file extensions (for read operations — tighter filtering)
const SOURCE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "rs", "py", "go", "rb", "java", "kt", "swift", "c", "cpp", "h", "hpp",
  "css", "scss", "less", "html", "vue", "svelte",
  "json", "toml", "yaml", "yml", "xml",
  "md", "mdx", "markdown", "txt", "rst",
  "sh", "bash", "zsh", "fish",
  "sql", "graphql", "gql",
  "dockerfile", "makefile",
  "lock", "env", "config", "conf",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "avif", "bmp",
  "pdf", "diff", "patch",
]);

function extractFilePath(line: string): string | null {
  // Try absolute path first
  const absMatch = line.match(ABS_PATH_RE);
  if (absMatch) {
    let path = absMatch[1];
    // Strip trailing punctuation that isn't part of a path
    path = path.replace(/[.,;:!?]+$/, "");
    // Reject system/virtual paths
    for (const prefix of DENY_PATH_PREFIXES) {
      if (path.startsWith(prefix)) return null;
    }
    return path;
  }
  // Try relative path
  const relMatch = line.match(REL_PATH_RE);
  if (relMatch) {
    let path = relMatch[1];
    path = path.replace(/[.,;:!?]+$/, "");
    return path;
  }
  return null;
}

/** Check if a path ends with a known source file extension */
function hasSourceExtension(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext != null && SOURCE_EXTENSIONS.has(ext);
}

// --- Tool Detection Patterns ---
// Tightened to match Claude Code's actual output format more specifically
// to reduce false positives from npm output, git output, etc.

// Write tool patterns — Claude Code outputs these when creating files
const WRITE_PATTERNS = [
  /\bWrote\b.*\bto\b/i,
  /\bwrote\s+new\s+file\b/i,
  /^\s*Created\s+\//,                         // "Created /path/to/file" at line start
  /\u2714.*\.(ts|tsx|js|jsx|rs|py|go|md|css|html|json|toml|yaml|yml|sh|txt)\b/,  // checkmark + file extension
];

// Edit tool patterns — Claude Code outputs these when modifying files
const EDIT_PATTERNS = [
  /^\s*Edited\s+\//,                          // "Edited /path/to/file" at line start
  /^\s*Updated\s+\//,                         // "Updated /path/to/file" at line start
  /\bModified\b.*\//,
  /\bPatched\b.*\//,
  /\bReplaced\b.*\//,
];

// Read tool patterns — Claude Code outputs these when reading files
const READ_PATTERNS = [
  /^\s*Read\s+\//,                            // "Read /path/to/file" at line start
  /^\s*Reading\s+\//,                         // "Reading /path/to/file" at line start
];

// Screenshot patterns
const SCREENSHOT_PATTERNS = [
  /\bscreenshot\b/i,
  /\bscreen\s*capture\b/i,
  /\.(png|jpg|jpeg|gif|webp|bmp|svg)\b/i,
];

// Lines to skip — common false positives
const SKIP_PATTERNS = [
  /^[\s]*$/,                   // blank lines
  /^[\s]*[│├└─┌┐┘┤┬┴┼]+/,    // box drawing (tree output)
  /^\s*\d+\s*[│|]/,           // line numbers in code blocks
  /^diff --git/,               // git diff headers
  /^[+-]{3}\s/,                // diff file markers
  /^@@/,                       // diff hunk headers
];

// --- Parser ---

export function parseToolOutput(line: string): ParsedToolOutput | null {
  const clean = stripAnsi(line).trim();

  // Skip empty or structural lines
  for (const skip of SKIP_PATTERNS) {
    if (skip.test(clean)) return null;
  }

  // Must have a file path to be interesting
  const filePath = extractFilePath(clean);
  if (!filePath) return null;

  // Check for screenshot (before write/edit since screenshot paths contain image extensions)
  for (const pattern of SCREENSHOT_PATTERNS) {
    if (pattern.test(clean)) {
      // Only match if the path ends with an image extension
      if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(filePath)) {
        return { filePath, operation: "screenshot" };
      }
    }
  }

  // Check for write/create operations
  for (const pattern of WRITE_PATTERNS) {
    if (pattern.test(clean)) {
      return { filePath, operation: "created" };
    }
  }

  // Check for edit/update operations
  for (const pattern of EDIT_PATTERNS) {
    if (pattern.test(clean)) {
      return { filePath, operation: "edited" };
    }
  }

  // Check for read operations — require a known source extension to reduce false positives
  for (const pattern of READ_PATTERNS) {
    if (pattern.test(clean) && hasSourceExtension(filePath)) {
      return { filePath, operation: "read" };
    }
  }

  return null;
}
