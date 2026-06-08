import * as fs from "fs";
import * as path from "path";
import { BehaviorSummaryReport, RunResult, TaskImpact, TaskMessage } from "../types";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function messages(value: unknown): TaskMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    const rawAttachments = Array.isArray(raw["attachments"]) ? raw["attachments"] : [];
    const attachments = rawAttachments.map((attachment: unknown) => {
      const rec = (attachment ?? {}) as Record<string, unknown>;
      return { type: "image" as const, path: str(rec["path"]), name: str(rec["name"]) };
    });
    return { role: str(raw["role"]), text: str(raw["text"]), at: str(raw["at"]), attachments };
  });
}

function impact(value: unknown): TaskImpact {
  const raw = (value ?? {}) as Record<string, unknown>;
  const notes = Array.isArray(raw["notes"]) ? (raw["notes"] as unknown[]).map((note) => str(note)) : [];
  return { risk: str(raw["risk"]), notes };
}

function summary(value: unknown): BehaviorSummaryReport {
  const raw = (value ?? {}) as Record<string, unknown>;
  return { file: str(raw["file"]), behavior: str(raw["behavior"]), text: str(raw["text"]) };
}

// Coerce the run's JSON into the discriminated RunResult. Unknown `kind` → null,
// meaning "the run produced nothing usable" (the host treats it like no result).
function normalize(raw: Record<string, unknown>): RunResult | null {
  switch (raw["kind"]) {
    case "proposed":
      return { kind: "proposed", diff: str(raw["diff"]), impact: impact(raw["impact"]), messages: messages(raw["messages"]) };
    case "applied":
      return {
        kind: "applied",
        diff: str(raw["diff"]),
        impact: impact(raw["impact"]),
        commitMessage: str(raw["commitMessage"]),
        messages: messages(raw["messages"]),
      };
    case "described":
      return { kind: "described", summary: summary(raw["summary"]), messages: messages(raw["messages"]) };
    case "error":
      return { kind: "error", messages: messages(raw["messages"]) };
    case "clarify":
      return { kind: "clarify", messages: messages(raw["messages"]) };
    default:
      return null;
  }
}

// Per-task run outcomes live in .perceptor/results/<id>.json. Each headless run owns
// exactly one such file, so concurrent runs never write the same file — the host
// reads + deletes it and is the only writer of the shared queue.
export class ResultStore {
  constructor(private readonly rootProvider: () => string) {}

  private dir(): string {
    return path.join(this.rootProvider(), ".perceptor", "results");
  }

  private file(taskId: string): string {
    return path.join(this.dir(), `${taskId}.json`);
  }

  // The result a run wrote, or null if it produced none (e.g. it crashed first).
  take(taskId: string): RunResult | null {
    const file = this.file(taskId);
    if (!fs.existsSync(file)) {
      return null;
    }
    try {
      const result = normalize(JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>);
      fs.rmSync(file, { force: true });
      return result;
    } catch {
      fs.rmSync(file, { force: true });
      return null;
    }
  }

  // Clear any stale result before a run starts, so a leftover file from an aborted
  // run can't be mistaken for this run's output.
  clear(taskId: string): void {
    fs.rmSync(this.file(taskId), { force: true });
  }
}
