import type { Task } from "../types";
import { parseUnifiedDiff, type DiffFile, type DiffFileKind } from "./diffParser";

// Where a change lands in the codebase's own structure: a new method (add), an
// edited method (edit), or a moved method leaving (out) / arriving (in).
export type ChangeStatus = "add" | "edit" | "out" | "in";

// A whole file in a free-form diff maps to the same colours: created = add (green),
// modified = edit (orange), deleted = out (red).
const FILE_STATUS: Record<DiffFileKind, ChangeStatus> = { add: "add", edit: "edit", del: "out" };

// A declaration-looking line and the keywords that share its shape but aren't members.
const MEMBER = /^(?:(?:export|default|public|private|protected|internal|static|async|override|abstract|virtual|final|readonly|get|set)\s+)*(?:function\s+)?([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/;
const MODIFIER = /^(?:export|default|public|private|protected|internal|static|async|override|abstract|virtual|final|readonly|get|set|function)\s+/;
const MEMBER_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "do", "else", "new", "await", "typeof", "super", "constructor"]);

export type MethodChange = {
  label: string;
  name: string;
  status: ChangeStatus;
  taskId: string;
  // The method's new-side body sliced from the diff, when the whole body is present in
  // the hunks (added/heavily-changed methods). Empty when only a fragment is in the diff
  // — the UI then points to Folder mode instead of showing partial-body metrics.
  code: string;
  // The method's old-side body sliced from the diff (the "before"), when the whole body
  // is present. Empty for a pure addition or when only a fragment was removed. Drives the
  // before/after panes so a change reads as two separated blocks, never an interleaved diff.
  oldCode: string;
}

export type FileChange = {
  path: string;
  status: ChangeStatus | null;
  taskId: string | null;
  added: number;
  removed: number;
  methods: MethodChange[];
}

export type ChangeFolder = {
  name: string;
  path: string;
  folders: Map<string, ChangeFolder>;
  files: Map<string, FileChange>;
}

// Groups pending changes into a folder > file > method tree mirroring Folder mode.
// One pass over the tasks (O(total changes)); never scans the codebase.
export function buildChangeTree(tasks: readonly Task[]): ChangeFolder {
  const root = newFolder("", "");
  for (const task of tasks) {
    addTask(root, task);
  }
  return root;
}

function addTask(root: ChangeFolder, task: Task): void {
  if (task.type === "add-behavior") {
    addMethod(root, task.from.file, methodLabel(task.spec.name), "add", task.id);
    return;
  }
  if (task.type === "edit-behavior") {
    addMethod(root, task.from.file, methodLabel(task.from.behavior), "edit", task.id);
    return;
  }
  if (task.type === "move-behavior") {
    const label = methodLabel(task.from.behavior);
    addMethod(root, task.from.file, label, "out", task.id);
    addMethod(root, task.to.file, label, "in", task.id);
    return;
  }
  if (task.type === "create-file") {
    fileLevel(root, joinPath(task.from.dir, task.spec.name), "add", task.id, 0, 0);
    return;
  }
  // Free-form (request) diff: one file row per real file — coloured by create/edit/
  // delete — with the changed methods surfaced beneath, so it reads like Folder mode.
  const diff = task.artifact.kind === "none" ? "" : task.artifact.diff;
  for (const diffFile of parseUnifiedDiff(diff)) {
    const file = fileLevel(root, diffFile.path, FILE_STATUS[diffFile.kind], task.id, diffFile.added, diffFile.removed);
    changedMembers(diffFile, task.id).forEach((member) => file.methods.push(member));
  }
}

// A file's post-change lines (context + additions) and pre-change lines (context +
// deletions), each tagged with whether the line itself changed. The two "sides" are what
// the before/after panes slice a method out of, and the `changed` flag is how a method is
// judged touched even when only its body — not its signature — sits on a +/- line.
type SideLine = { text: string; changed: boolean };
type Member = { name: string; signature: string; code: string; changed: boolean };

// Per-hunk so brace matching stays inside one contiguous region — concatenating distant
// hunks could pair an opening brace in one with a closing brace in another and invent a
// giant bogus "method".
function newSide(file: DiffFile): SideLine[][] {
  return file.hunks.map((hunk) =>
    hunk.lines.filter((line) => line.kind === "add" || line.kind === "context").map((line) => ({ text: line.text, changed: line.kind === "add" }))
  );
}

function oldSide(file: DiffFile): SideLine[][] {
  return file.hunks.map((hunk) =>
    hunk.lines.filter((line) => line.kind === "del" || line.kind === "context").map((line) => ({ text: line.text, changed: line.kind === "del" }))
  );
}

// Pull the methods a file's diff actually touches — the same units Folder mode shows.
// Scan each side for declarations, brace-match each body, and keep a method only when a
// changed (+/-) line falls inside it — so a body-only edit counts even though its
// signature stayed unchanged context (the case the old +/- -declaration scan missed).
// Matching old↔new by name collapses an edited method into one row and feeds the before
// pane its old body. It can miss an exotic signature, but never invents an untouched member.
function changedMembers(file: DiffFile, taskId: string): MethodChange[] {
  const newMembers = newSide(file).flatMap(membersIn);
  const oldMembers = oldSide(file).flatMap(membersIn);
  const oldByName = new Map(oldMembers.map((member) => [member.name, member]));
  const newByName = new Map(newMembers.map((member) => [member.name, member]));
  const edited = newMembers
    .filter((member) => isTouched(member, oldByName.get(member.name)))
    .map((member) => editedOrAdded(member, oldByName.get(member.name), taskId));
  const deleted = oldMembers
    .filter((member) => member.changed && !newByName.has(member.name))
    .map((member) => deletedMember(member, taskId));
  return [...edited, ...deleted];
}

// A method present after the change counts as touched when its own lines changed, or its
// old twin changed, or the two bodies differ — never when both sides are identical context.
function isTouched(member: Member, old: Member | undefined): boolean {
  if (member.changed) {
    return true;
  }
  if (!old) {
    return false;
  }
  return old.changed || old.code !== member.code;
}

function editedOrAdded(member: Member, old: Member | undefined, taskId: string): MethodChange {
  return {
    label: member.signature || `${member.name}()`,
    name: member.name,
    status: old ? "edit" : "add",
    taskId,
    code: member.code,
    oldCode: old?.code ?? "",
  };
}

function deletedMember(member: Member, taskId: string): MethodChange {
  return { label: member.signature || `${member.name}()`, name: member.name, status: "out", taskId, code: "", oldCode: member.code };
}

// Every method declaration in one side, with its full brace-matched body. Jumps past each
// matched body so a nested declaration isn't double-counted and the enclosing class brace
// (not a member) is simply skipped.
function membersIn(lines: SideLine[]): Member[] {
  const texts = lines.map((line) => line.text);
  const members: Member[] = [];
  let index = 0;
  while (index < lines.length) {
    const signature = memberSignature(texts[index] ?? "");
    const endLine = signature ? matchBodyLines(texts, index) : -1;
    if (!signature || endLine === -1) {
      index += 1;
      continue;
    }
    members.push({
      name: signature.name,
      signature: signature.signature,
      code: texts.slice(index, endLine + 1).join("\n"),
      changed: lines.slice(index, endLine + 1).some((line) => line.changed),
    });
    index = endLine + 1;
  }
  return members;
}

// The last line index of the body that opens at/after `from`, by reusing the char-level
// brace matcher on the joined remainder. -1 when the body never balances inside the diff.
function matchBodyLines(texts: string[], from: number): number {
  const slice = texts.slice(from).join("\n");
  const end = matchBody(slice, 0);
  if (end === -1) {
    return -1;
  }
  return from + slice.slice(0, end).split("\n").length - 1;
}

// Slice a method's full body out of a text by brace-matching from its declaration.
// Returns "" when the body isn't fully present (a partial edit), so the UI never
// computes metrics on a fragment. Exported so the webview can reuse the same matcher to
// carve a method out of the live file (the "current" pane).
export function sliceMethod(text: string, name: string): string {
  const declaration = new RegExp(`(?:^|\\n)([^\\n]*\\b${escapeRegExp(name)}\\s*\\([^\\n]*)`).exec(text);
  if (!declaration) {
    return "";
  }
  const start = declaration.index === 0 ? 0 : declaration.index + 1;
  const end = matchBody(text, start);
  return end === -1 ? "" : text.slice(start, end);
}

// Index just past the `}` that closes the first `{` at/after `from`, skipping braces in
// strings and comments. -1 if there's no opening brace or it never balances.
function matchBody(text: string, from: number): number {
  let index = text.indexOf("{", from);
  if (index === -1) {
    return -1;
  }
  let depth = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    const next = text.charAt(index + 1);
    if (char === "/" && next === "/") {
      index = skipUntil(text, index + 2, "\n");
    } else if (char === "/" && next === "*") {
      index = skipBlockComment(text, index + 2);
    } else if (char === '"' || char === "'" || char === "`") {
      index = skipQuoted(text, index);
    } else {
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return index + 1;
        }
      }
      index += 1;
    }
  }
  return -1;
}

function skipUntil(text: string, from: number, stop: string): number {
  const index = text.indexOf(stop, from);
  return index === -1 ? text.length : index;
}

function skipBlockComment(text: string, from: number): number {
  const index = text.indexOf("*/", from);
  return index === -1 ? text.length : index + 2;
}

function skipQuoted(text: string, from: number): number {
  const quote = text.charAt(from);
  let index = from + 1;
  while (index < text.length && text.charAt(index) !== quote) {
    index += text.charAt(index) === "\\" ? 2 : 1;
  }
  return index + 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function memberSignature(text: string): { name: string; signature: string } | null {
  const trimmed = text.trim();
  const name = MEMBER.exec(trimmed)?.[1];
  if (!name || MEMBER_KEYWORDS.has(name)) {
    return null;
  }
  const hasModifier = MODIFIER.test(trimmed);
  const looksLikeDeclaration = /\)\s*(?:\{|=>|:)/.test(trimmed) || trimmed.endsWith("{");
  if (!hasModifier && !looksLikeDeclaration) {
    return null;
  }
  let rest = trimmed;
  while (MODIFIER.test(rest)) {
    rest = rest.replace(MODIFIER, "");
  }
  const signature = rest.replace(/\s*(?:=>.*|\{)\s*$/, "").trim();
  return { name, signature };
}

function addMethod(
  root: ChangeFolder,
  filePath: string,
  label: string,
  status: ChangeStatus,
  taskId: string
): void {
  if (!filePath) {
    return;
  }
  ensureFile(root, filePath).methods.push({ label, name: label.replace(/\(\)$/, ""), status, taskId, code: "", oldCode: "" });
}

function fileLevel(
  root: ChangeFolder,
  filePath: string,
  status: ChangeStatus,
  taskId: string,
  added: number,
  removed: number
): FileChange {
  const file = ensureFile(root, filePath);
  file.status = status;
  file.taskId = taskId;
  file.added += added;
  file.removed += removed;
  return file;
}

function ensureFile(root: ChangeFolder, filePath: string): FileChange {
  const segments = filePath.split("/").filter(Boolean);
  const fileName = segments.pop() ?? filePath;
  let folder = root;
  let accumulated = "";
  for (const segment of segments) {
    accumulated = accumulated ? `${accumulated}/${segment}` : segment;
    let next = folder.folders.get(segment);
    if (!next) {
      next = newFolder(segment, accumulated);
      folder.folders.set(segment, next);
    }
    folder = next;
  }
  let file = folder.files.get(fileName);
  if (!file) {
    file = { path: filePath, status: null, taskId: null, added: 0, removed: 0, methods: [] };
    folder.files.set(fileName, file);
  }
  return file;
}

function newFolder(name: string, path: string): ChangeFolder {
  return { name, path, folders: new Map(), files: new Map() };
}

function methodLabel(name: string): string {
  return name ? `${name}()` : "()";
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}
