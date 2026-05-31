import type { Task } from "../types";
import { fromFile, toFile } from "../taskView";
import { parseUnifiedDiff } from "./diffParser";

export type GitState = {
  isRepo: boolean;
  dirtyFiles: ReadonlySet<string>;
  trackedFiles: ReadonlySet<string>;
}

// Every file a task touches — from its diff and its endpoints. git reports
// repo-relative paths that match the endpoints, so we check both.
export function taskFiles(task: Task): string[] {
  const files = new Set<string>();
  for (const file of parseUnifiedDiff(task.diff ?? "")) {
    files.add(file.path);
  }
  const from = fromFile(task);
  if (from) {
    files.add(from);
  }
  const to = toFile(task);
  if (to) {
    files.add(to);
  }
  return [...files];
}

// Committed = an applied change whose files are tracked by git AND clean. Untracked
// or moved-away files aren't committed, so without real version control every applied
// change counts as still-local (Tasks), never committed (Changes).
export function isTaskCommitted(task: Task, git: GitState): boolean {
  if (!git.isRepo || task.status !== "applied") {
    return false;
  }
  const files = taskFiles(task);
  return files.length > 0 && files.every((file) => git.trackedFiles.has(file) && !git.dirtyFiles.has(file));
}
