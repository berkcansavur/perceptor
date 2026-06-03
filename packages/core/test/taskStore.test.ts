import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskStore } from "../src/service/task/TaskStore";
import type { EnqueuePayload } from "../src/service/types";

function request(description: string): EnqueuePayload {
  return { type: "request", spec: { description } };
}

let root: string;
let store: TaskStore;

// Inject a proposal the way a headless run does — via the merged result, not the update RPC.
function propose(id: string, diff: string): void {
  store.mergeResult(id, { kind: "proposed", diff, impact: { risk: "low", notes: [] }, messages: [] });
}

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
    propose(task.id, "--- a/x\n+++ b/x\n");
    store.mutate(task.id, (item) => {
      item.sessionId = "sess-1";
      item.auto = { status: "proposed", attempts: 1 };
      item.messages.push({ role: "claude", text: "done", at: "2026-01-01T00:00:00Z" });
    });

    const edited = store.editRequest(task.id, "second ask");

    expect(edited.status).toBe("pending");
    const stored = store.read()[0];
    expect(stored?.type).toBe("request");
    if (stored?.type === "request") {
      expect(stored.spec.description).toBe("second ask");
    }
    expect(stored?.artifact.kind).toBe("none");
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

  it("throws for a non-request task", () => {
    const folder = store.enqueue({ type: "create-folder", from: { dir: "src" }, spec: { name: "x" } });
    expect(() => store.editRequest(folder.id, "nope")).toThrow();
  });
});

describe("TaskStore.editMessage", () => {
  function withThread(): string {
    const task = store.enqueue(request("first ask"));
    propose(task.id, "--- a/x\n+++ b/x\n");
    store.mutate(task.id, (item) => {
      item.sessionId = "sess-1";
      item.messages.push({ role: "user", text: "do A", at: "2026-01-01T00:00:00Z" });
      item.messages.push({ role: "claude", text: "did A", at: "2026-01-01T00:01:00Z" });
      item.messages.push({ role: "user", text: "do B", at: "2026-01-01T00:02:00Z" });
    });
    return task.id;
  }

  it("rewrites a message, drops later turns, and resets to re-run cold", () => {
    const id = withThread();

    const edited = store.editMessage(id, 0, "do A differently");

    expect(edited.status).toBe("pending");
    const stored = store.read()[0];
    expect(stored?.messages).toEqual([{ role: "user", text: "do A differently", at: "2026-01-01T00:00:00Z", attachments: [] }]);
    expect(stored?.artifact.kind).toBe("none");
    expect(stored?.sessionId).toBeNull();
  });

  it("preserves token usage across a message edit", () => {
    const id = withThread();
    store.mutate(id, (item) => {
      item.usage = {
        inputTokens: 80,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0.02,
        runs: 2,
        at: "2026-01-01T00:00:00Z",
      };
    });

    store.editMessage(id, 0, "revised");

    expect(store.read()[0]?.usage?.runs).toBe(2);
  });

  it("refuses to edit a claude message or an out-of-range index", () => {
    const id = withThread();
    expect(() => store.editMessage(id, 1, "nope")).toThrow();
    expect(() => store.editMessage(id, 9, "nope")).toThrow();
  });
});
