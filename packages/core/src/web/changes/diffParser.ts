// Single-pass (O(n) over diff lines) unified-diff parser. Turns the raw `diff`
// a task carries into a structured model the Changes tab renders git-style.

export type DiffLineKind = "add" | "del" | "context" | "meta";

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
}

export type DiffHunk = {
  header: string;
  lines: DiffLine[];
}

export type DiffFile = {
  path: string;
  added: number;
  removed: number;
  hunks: DiffHunk[];
}

const GIT_HEADER = "diff --git ";
const OLD_FILE = "--- ";
const NEW_FILE = "+++ ";
const HUNK = "@@";

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;

  for (const line of diff.split("\n")) {
    if (line.startsWith(GIT_HEADER)) {
      file = startFile(files, pathFromGitHeader(line));
      hunk = null;
    } else if (line.startsWith(NEW_FILE)) {
      file = ensureFile(files, file, stripPathPrefix(line.slice(NEW_FILE.length)));
      hunk = null;
    } else if (line.startsWith(OLD_FILE)) {
      file = ensureFile(files, file, file ? file.path : stripPathPrefix(line.slice(OLD_FILE.length)));
    } else if (line.startsWith(HUNK)) {
      file = ensureFile(files, file, "");
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
    } else if (hunk && file) {
      appendLine(file, hunk, line);
    }
  }
  return files;
}

function startFile(files: DiffFile[], path: string): DiffFile {
  const file: DiffFile = { path, added: 0, removed: 0, hunks: [] };
  files.push(file);
  return file;
}

function ensureFile(files: DiffFile[], current: DiffFile | null, path: string): DiffFile {
  if (current) {
    if (path && current.path === "") {
      current.path = path;
    }
    return current;
  }
  return startFile(files, path);
}

function appendLine(file: DiffFile, hunk: DiffHunk, line: string): void {
  if (line.startsWith("+")) {
    file.added += 1;
    hunk.lines.push({ kind: "add", text: line.slice(1) });
  } else if (line.startsWith("-")) {
    file.removed += 1;
    hunk.lines.push({ kind: "del", text: line.slice(1) });
  } else if (line.startsWith("\\")) {
    hunk.lines.push({ kind: "meta", text: line });
  } else {
    hunk.lines.push({ kind: "context", text: line.startsWith(" ") ? line.slice(1) : line });
  }
}

function pathFromGitHeader(line: string): string {
  const parts = line.slice(GIT_HEADER.length).split(" ");
  const target = parts[parts.length - 1] ?? "";
  return stripPathPrefix(target);
}

function stripPathPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "/dev/null") {
    return trimmed;
  }
  return trimmed.replace(/^[ab]\//, "");
}
