import { Task } from "../types";

const DIFF_PATH = /^(?:\+\+\+|---) [ab]\/(.+)$/;
const GIT_RENAME = /^rename (?:from|to) (.+)$/;

// Source files a task's diff touches. Read straight from the unified diff headers
// (and git rename lines); /dev/null entries (new/deleted side) are ignored.
function diffFiles(diff: string): Set<string> {
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    const pathMatch = DIFF_PATH.exec(line);
    if (pathMatch && pathMatch[1] && pathMatch[1] !== "/dev/null") {
      files.add(pathMatch[1]);
      continue;
    }
    const renameMatch = GIT_RENAME.exec(line);
    if (renameMatch && renameMatch[1]) {
      files.add(renameMatch[1]);
    }
  }
  return files;
}

// Source files this task's endpoints name (narrowed by type — directory/request
// endpoints touch no source file).
function endpointFiles(task: Task): string[] {
  switch (task.type) {
    case "move-behavior":
      return [task.from.file, task.to.file];
    case "add-behavior":
    case "edit-behavior":
    case "describe-behavior":
      return [task.from.file];
    default:
      return [];
  }
}

// The files a run for this task could edit — its conflict footprint. Empty until the
// task has a diff: a first propose run is read-only on source, so it can't conflict.
// Once a diff exists, those are the files an apply (or revision) will write.
export function taskFootprint(task: Task): Set<string> {
  if (task.artifact.kind === "none") {
    return new Set();
  }
  const files = diffFiles(task.artifact.diff);
  for (const file of endpointFiles(task)) {
    files.add(file);
  }
  return files;
}

export function footprintsOverlap(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const file of a) {
    if (b.has(file)) {
      return true;
    }
  }
  return false;
}
