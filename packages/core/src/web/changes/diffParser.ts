// Single-pass (O(n) over diff lines) unified-diff parser. Turns the raw `diff` a
// task carries into a structured per-file model the Changes tab renders folder-style.
// Handles diffs WITH or WITHOUT `diff --git` headers: a `--- old` line immediately
// followed by `+++ new` marks each file, and /dev/null on either side flags a
// create/delete. (Without the lookahead, a header-less multi-file diff collapses into
// one file, which is what made the view look like a raw git blob.)

export type DiffLineKind = "add" | "del" | "context" | "meta";
export type DiffFileKind = "add" | "edit" | "del";

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
  kind: DiffFileKind;
  added: number;
  removed: number;
  hunks: DiffHunk[];
}

const GIT_HEADER = "diff --git ";
const OLD_FILE = "--- ";
const NEW_FILE = "+++ ";
const HUNK = "@@";
const DEV_NULL = "/dev/null";

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const rows = diff.split("\n");
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;

  for (let index = 0; index < rows.length; index += 1) {
    const line = rows[index] ?? "";
    const nextLine = rows[index + 1] ?? "";
    if (line.startsWith(GIT_HEADER)) {
      file = null;
      hunk = null;
    } else if (line.startsWith(OLD_FILE) && nextLine.startsWith(NEW_FILE)) {
      file = startFileFromHeader(files, line, nextLine);
      hunk = null;
      index += 1;
    } else if (line.startsWith(HUNK)) {
      file = file ?? startFile(files, "", "edit");
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
    } else if (hunk && file) {
      appendLine(file, hunk, line);
    }
  }
  return files;
}

function startFileFromHeader(files: DiffFile[], oldLine: string, newLine: string): DiffFile {
  const oldPath = stripPathPrefix(oldLine.slice(OLD_FILE.length));
  const newPath = stripPathPrefix(newLine.slice(NEW_FILE.length));
  const path = newPath === DEV_NULL ? oldPath : newPath;
  const kind: DiffFileKind = oldPath === DEV_NULL ? "add" : newPath === DEV_NULL ? "del" : "edit";
  return startFile(files, path, kind);
}

function startFile(files: DiffFile[], path: string, kind: DiffFileKind): DiffFile {
  const file: DiffFile = { path, kind, added: 0, removed: 0, hunks: [] };
  files.push(file);
  return file;
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

function stripPathPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === DEV_NULL) {
    return trimmed;
  }
  return trimmed.replace(/^[ab]\//, "");
}
