import type { Task } from "./types";

// Read helpers that narrow the discriminated Task by its type, so the UI asks "what
// is this task's target file / spec description" without re-deriving the union
// narrowing at every call site. Types that don't carry a field return "".

export function fromFile(task: Task): string {
  switch (task.type) {
    case "move-behavior":
    case "add-behavior":
    case "edit-behavior":
    case "describe-behavior":
      return task.from.file;
    default:
      return "";
  }
}

export function fromClass(task: Task): string {
  switch (task.type) {
    case "move-behavior":
    case "add-behavior":
    case "edit-behavior":
    case "describe-behavior":
      return task.from.class;
    default:
      return "";
  }
}

export function fromBehavior(task: Task): string {
  switch (task.type) {
    case "move-behavior":
    case "edit-behavior":
    case "describe-behavior":
      return task.from.behavior;
    default:
      return "";
  }
}

export function fromDir(task: Task): string {
  return task.type === "create-file" || task.type === "create-folder" ? task.from.dir : "";
}

export function toClass(task: Task): string {
  return task.type === "move-behavior" ? task.to.class : "";
}

export function toFile(task: Task): string {
  return task.type === "move-behavior" ? task.to.file : "";
}

export function specName(task: Task): string {
  switch (task.type) {
    case "add-behavior":
    case "create-file":
    case "create-folder":
      return task.spec.name;
    default:
      return "";
  }
}

export function specDescription(task: Task): string {
  switch (task.type) {
    case "add-behavior":
    case "edit-behavior":
    case "create-file":
    case "request":
      return task.spec.description;
    default:
      return "";
  }
}

export function specSignature(task: Task): string {
  return task.type === "add-behavior" || task.type === "edit-behavior" ? task.spec.signature : "";
}
