import { describe, expect, it } from "vitest";
import { footprintsOverlap, taskFootprint } from "../src/service/task/taskFootprint";
import type { Task, TaskKind } from "../src/service/types";

function task(kind: TaskKind, diff: string | null): Task {
  return {
    ...kind,
    status: "pending",
    artifact: diff === null ? { kind: "none" } : { kind: "proposed", diff, impact: { risk: "low", notes: [] } },
    id: "t1",
    dismissed: false,
    lock: null,
    auto: null,
    usage: null,
    sessionId: null,
    messages: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function request(diff: string | null): Task {
  return task({ type: "request", spec: { description: "" } }, diff);
}

function move(diff: string, fromFile: string, toFile: string): Task {
  return task(
    {
      type: "move-behavior",
      from: { class: "A", file: fromFile, behavior: "m" },
      to: { class: "B", file: toFile },
    },
    diff
  );
}

describe("taskFootprint", () => {
  it("is empty before a diff exists (a propose run edits nothing)", () => {
    expect(taskFootprint(request(null))).toEqual(new Set());
  });

  it("collects the files a unified diff touches, ignoring /dev/null", () => {
    const diff = ["--- a/src/A.ts", "+++ b/src/A.ts", "@@ -1 +1 @@", "--- /dev/null", "+++ b/src/New.ts"].join("\n");
    expect(taskFootprint(request(diff))).toEqual(new Set(["src/A.ts", "src/New.ts"]));
  });

  it("includes the from/to endpoints alongside the diff", () => {
    const footprint = taskFootprint(move("--- a/x\n+++ b/x\n", "src/From.ts", "src/To.ts"));
    expect(footprint.has("src/From.ts")).toBe(true);
    expect(footprint.has("src/To.ts")).toBe(true);
  });

  it("detects overlap between footprints", () => {
    expect(footprintsOverlap(new Set(["a", "b"]), new Set(["b"]))).toBe(true);
    expect(footprintsOverlap(new Set(["a"]), new Set(["b"]))).toBe(false);
  });
});
