import { EnqueuePayload, TaskImpact, TaskStatus, UpdatePayload } from "../types";
import { coerceKind } from "../task/taskCoercion";

// Boundary coercion: the webview RPC hands us untyped records, so here — and only
// here — we turn them into complete, typed domain payloads.

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function toImpact(value: unknown): TaskImpact | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const notes = Array.isArray(record["notes"]) ? (record["notes"] as unknown[]).map((note) => String(note)) : [];
  return { risk: asString(record["risk"]) ?? "", notes };
}

export function toEnqueuePayload(payload: Record<string, unknown>): EnqueuePayload {
  return coerceKind(payload["type"], payload["from"], payload["to"], payload["spec"]);
}

export function toUpdatePayload(payload: Record<string, unknown>): UpdatePayload {
  return {
    id: asString(payload["id"]) ?? "",
    status: asString(payload["status"]) as TaskStatus | null,
    message: asString(payload["message"]),
    diff: asString(payload["diff"]),
    role: asString(payload["role"]),
    commitMessage: asString(payload["commitMessage"]),
    impact: toImpact(payload["impact"]),
    dismissed: typeof payload["dismissed"] === "boolean" ? (payload["dismissed"] as boolean) : null,
  };
}
