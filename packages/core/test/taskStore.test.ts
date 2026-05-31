import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskStore } from "../src/service/task/TaskStore";
import type { EnqueuePayload, UpdatePayload } from "../src/service/types";

function request(description: string): EnqueuePayload {
  return { type: "request", spec: { description } };
}

function propose(id: string, diff: string): UpdatePayload {
  return { id, status: "proposed", message: null, diff, role: null, commitMessage: null, impact: null, dismissed: null };
}

let root: string;
let store: TaskStore;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rv-store-"));
  store = new TaskStore(() => root);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("TaskStore.editRequest", () => {
  it("rewrites the prompt and resets the task to re-run cold", () => {
    const task = store.enqueue(request("first ask"));
    store.update(propose(task.id, "--- a/x\n+++ b/x\n"));
    store.mutate(task.id, (item) => {
      item.sessionId = "sess-1";
      item.auto = { status: "proposed", attempts: 1 };
      item.messages.push({ role: "claude", text: "done", at: "2026-01-01T00:00:00Z" });
    });

    const edited = store.editRequest(task.id, "second ask");

    expect(edited?.status).toBe("pending");
    const stored = store.read()[0];
    expect(stored?.type).toBe("request");
    if (stored?.type === "request") {
      expect(stored.spec.description).toBe("second ask");
    }
    expect(stored?.diff).toBeNull();
    expect(stored?.sessionId).toBeNull();
    expect(stored?.auto).toBeNull();
    expect(stored?.messages).toEqual([]);
  });

  it("preserves accumulated token usage across an edit", () => {
    const task = store.enqueue(request("ask"));
    store.mutate(task.id, (item) => {
      item.usage = {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0.01,
        runs: 1,
        at: "2026-01-01T00:00:00Z",
      };
    });

    store.editRequest(task.id, "new ask");

    const usage = store.read()[0]?.usage;
    expect(usage?.inputTokens).toBe(100);
    expect(usage?.runs).toBe(1);
    expect(usage?.costUsd).toBeCloseTo(0.01);
  });

  it("returns null for a non-request task", () => {
    const folder = store.enqueue({ type: "create-folder", from: { dir: "src" }, spec: { name: "x" } });
    expect(store.editRequest(folder.id, "nope")).toBeNull();
  });
});
