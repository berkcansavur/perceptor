import type { Task } from "../types";
import { parseUnifiedDiff } from "./diffParser";

// Where a change lands in the codebase's own structure: a new method (add), an
// edited method (edit), or a moved method leaving (out) / arriving (in).
export type ChangeStatus = "add" | "edit" | "out" | "in";

export type MethodChange = {
  label: string;
  status: ChangeStatus;
  taskId: string;
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
  for (const file of parseUnifiedDiff(task.diff ?? "")) {
    fileLevel(root, file.path, "edit", task.id, file.added, file.removed);
  }
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
  ensureFile(root, filePath).methods.push({ label, status, taskId });
}

function fileLevel(
  root: ChangeFolder,
  filePath: string,
  status: ChangeStatus,
  taskId: string,
  added: number,
  removed: number
): void {
  if (!filePath) {
    return;
  }
  const file = ensureFile(root, filePath);
  file.status = status;
  file.taskId = taskId;
  file.added += added;
  file.removed += removed;
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
