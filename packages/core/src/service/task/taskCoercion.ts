import {
  AddBehaviorSpec,
  BehaviorEndpoint,
  ClassFileEndpoint,
  CreateFileSpec,
  CreateFolderSpec,
  DescribeBehaviorSpec,
  DirectoryEndpoint,
  EditBehaviorSpec,
  ErrorHandling,
  ErrorHandlingMode,
  RequestSpec,
  TaskKind,
} from "../types";

// Builds a fully-typed TaskKind from loose input (RPC payload or persisted JSON),
// so the rest of the app only ever sees the discriminated shape — each type with
// exactly its endpoints and spec, no nullable "maybe" props.

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function behaviorEndpoint(value: unknown): BehaviorEndpoint {
  const raw = record(value);
  return { class: str(raw["class"]), file: str(raw["file"]), behavior: str(raw["behavior"]) };
}

function classFileEndpoint(value: unknown): ClassFileEndpoint {
  const raw = record(value);
  return { class: str(raw["class"]), file: str(raw["file"]) };
}

function directoryEndpoint(value: unknown): DirectoryEndpoint {
  return { dir: str(record(value)["dir"]) };
}

function errorHandling(value: unknown): ErrorHandling {
  const raw = record(value);
  const mode = str(raw["mode"]);
  const known: ErrorHandlingMode = mode === "throw" || mode === "nullable" ? mode : "default";
  return { mode: known, exception: str(raw["exception"]) };
}

function addSpec(value: unknown): AddBehaviorSpec {
  const raw = record(value);
  return {
    name: str(raw["name"]),
    description: str(raw["description"]),
    signature: str(raw["signature"]),
    errorHandling: errorHandling(raw["errorHandling"]),
  };
}

function editSpec(value: unknown): EditBehaviorSpec {
  const raw = record(value);
  return {
    description: str(raw["description"]),
    signature: str(raw["signature"]),
    line: num(raw["line"]),
    endLine: num(raw["endLine"]),
  };
}

function createFileSpec(value: unknown): CreateFileSpec {
  const raw = record(value);
  return { name: str(raw["name"]), description: str(raw["description"]) };
}

function createFolderSpec(value: unknown): CreateFolderSpec {
  return { name: str(record(value)["name"]) };
}

function requestSpec(value: unknown): RequestSpec {
  return { description: str(record(value)["description"]) };
}

function describeSpec(value: unknown): DescribeBehaviorSpec {
  const raw = record(value);
  return { line: num(raw["line"]), endLine: num(raw["endLine"]), flowOutline: str(raw["flowOutline"]) };
}

export function coerceKind(type: unknown, from: unknown, to: unknown, spec: unknown): TaskKind {
  switch (type) {
    case "add-behavior":
      return { type, from: classFileEndpoint(from), spec: addSpec(spec) };
    case "edit-behavior":
      return { type, from: behaviorEndpoint(from), spec: editSpec(spec) };
    case "create-file":
      return { type, from: directoryEndpoint(from), spec: createFileSpec(spec) };
    case "create-folder":
      return { type, from: directoryEndpoint(from), spec: createFolderSpec(spec) };
    case "request":
      return { type, spec: requestSpec(spec) };
    case "describe-behavior":
      return { type, from: behaviorEndpoint(from), spec: describeSpec(spec) };
    default:
      return { type: "move-behavior", from: behaviorEndpoint(from), to: classFileEndpoint(to) };
  }
}
