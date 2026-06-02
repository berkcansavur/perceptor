import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoProcessor } from "../src/service/processing/AutoProcessor";
import { TaskStore } from "../src/service/task/TaskStore";
import type { AutoProcessRun, AutoProcessRunner, RunSession } from "../src/service/processing/AutoProcessRunner";
import type { StreamUsage } from "../src/service/processing/streamActivity";
import type { EnqueuePayload, UpdatePayload } from "../src/service/types";

function blankTask(): EnqueuePayload {
  return { type: "request", from: null, to: null, spec: null };
}

function reply(id: string, message: string): UpdatePayload {
  return { id, intent: "reply", message };
}

// Give the task a diff (so it has a real file footprint) and approve it — the diff is
// injected via the merged result, exactly as a headless propose run would.
function approve(id: string, diff: string): void {
  store.mergeResult(id, { kind: "proposed", diff, impact: { risk: "low", notes: [] }, messages: [] });
  store.update({ id, intent: "set-status", status: "approved" });
}

const DEBOUNCE_MS = 150;
const WATCHDOG_MS = 45000;
const FAKE_PID = 4242;
const DEAD_PID = 999999;

class FakeRun implements AutoProcessRun {
  readonly pid = FAKE_PID;
  killed = false;
  private listener: ((errorMessage: string | null) => void) | null = null;
  private activityListener: ((text: string) => void) | null = null;
  private usageListener: ((usage: StreamUsage) => void) | null = null;

  onExit(listener: (errorMessage: string | null) => void): void {
    this.listener = listener;
  }

  onActivity(listener: (text: string) => void): void {
    this.activityListener = listener;
  }

  onUsage(listener: (usage: StreamUsage) => void): void {
    this.usageListener = listener;
  }

  emitActivity(text: string): void {
    this.activityListener?.(text);
  }

  emitUsage(usage: StreamUsage): void {
    this.usageListener?.(usage);
  }

  // Mirrors the real run: killing it ends the process, so exit fires.
  kill(): void {
    this.killed = true;
    this.finish(null);
  }

  finish(errorMessage: string | null = null): void {
    this.listener?.(errorMessage);
  }
}

class FakeRunner implements AutoProcessRunner {
  readonly available = true;
  readonly unavailableReason = null;
  readonly runs: FakeRun[] = [];
  readonly taskIds: string[] = [];
  readonly sessions: RunSession[] = [];

  run(_rootDirectory: string, taskId: string, session: RunSession): AutoProcessRun {
    this.taskIds.push(taskId);
    this.sessions.push(session);
    const run = new FakeRun();
    this.runs.push(run);
    return run;
  }
}

let root: string;
let store: TaskStore;
let runner: FakeRunner;
let processor: AutoProcessor;

beforeEach(() => {
  vi.useFakeTimers();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rv-auto-"));
  store = new TaskStore(() => root);
  runner = new FakeRunner();
  processor = new AutoProcessor(() => root, store, runner);
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("AutoProcessor", () => {
  it("spawns one run for a pending task after the debounce window", () => {
    processor.setEnabled(true);
    store.enqueue(blankTask());
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.runs).toHaveLength(1);
    expect(store.read()[0]?.lock?.pid).toBe(FAKE_PID);
  });

  it("scopes the run to the claimed task's id", () => {
    processor.setEnabled(true);
    const task = store.enqueue(blankTask());
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.taskIds).toEqual([task.id]);
  });

  it("stop() kills the in-flight run, clears the lock and does not re-trigger", () => {
    processor.setEnabled(true);
    store.enqueue(blankTask());
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(runner.runs).toHaveLength(1);

    processor.stop("⏹ Stopped by user.", null);
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.runs[0]?.killed).toBe(true);
    const task = store.read()[0];
    expect(task?.lock).toBeNull();
    // gated so the watchdog/notify won't spawn it again
    expect(runner.runs).toHaveLength(1);
    expect(task?.messages.at(-1)?.text).toContain("Stopped");
  });

  it("does not spawn a second run while one is in flight", () => {
    processor.setEnabled(true);
    store.enqueue(blankTask());
    vi.advanceTimersByTime(DEBOUNCE_MS);

    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.runs).toHaveLength(1);
  });

  it("runs up to the concurrency limit in parallel and drains the rest", () => {
    processor.setEnabled(true);
    for (let i = 0; i < 4; i += 1) {
      store.enqueue(blankTask());
    }
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(runner.runs).toHaveLength(3);

    runner.runs[0]?.finish(null);
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(runner.runs).toHaveLength(4);
  });

  it("defers a task whose file footprint overlaps an in-flight run", () => {
    processor.setEnabled(true);
    const a = store.enqueue(blankTask());
    const b = store.enqueue(blankTask());
    const diff = "--- a/src/Shared.ts\n+++ b/src/Shared.ts\n@@ -1 +1 @@\n-x\n+y\n";
    approve(a.id, diff);
    approve(b.id, diff);
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.runs).toHaveLength(1);
    expect(runner.taskIds).toEqual([a.id]);

    runner.runs[0]?.finish(null);
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(runner.taskIds).toContain(b.id);
  });

  it("merges a run's result file into the task and deletes it", () => {
    processor.setEnabled(true);
    const task = store.enqueue(blankTask());
    vi.advanceTimersByTime(DEBOUNCE_MS);

    const resultPath = path.join(root, ".visualise", "results", `${task.id}.json`);
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(
      resultPath,
      JSON.stringify({
        kind: "proposed",
        diff: "--- a/x\n+++ b/x\n",
        impact: { risk: "low", notes: [] },
        messages: [{ role: "claude", text: "done", at: "2026-01-01T00:00:00Z" }],
      })
    );
    runner.runs[0]?.finish(null);

    const merged = store.read()[0];
    expect(merged?.status).toBe("proposed");
    const artifact = merged?.artifact;
    expect(artifact?.kind).toBe("proposed");
    expect(artifact && "diff" in artifact ? artifact.diff : "").toContain("+++ b/x");
    expect(merged?.messages.at(-1)?.text).toBe("done");
    expect(fs.existsSync(resultPath)).toBe(false);
  });

  it("stop(taskId) kills only that task's run", () => {
    processor.setEnabled(true);
    const a = store.enqueue(blankTask());
    const b = store.enqueue(blankTask());
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(runner.runs).toHaveLength(2);

    processor.stop("stopped", b.id);

    const aRun = runner.runs[runner.taskIds.indexOf(a.id)];
    const bRun = runner.runs[runner.taskIds.indexOf(b.id)];
    expect(bRun?.killed).toBe(true);
    expect(aRun?.killed).toBe(false);
  });

  it("reaps a stale lock from a dead process via the watchdog", () => {
    processor.setEnabled(true);
    vi.advanceTimersByTime(DEBOUNCE_MS);

    const task = store.enqueue(blankTask());
    store.mutate(task.id, (item) => {
      item.lock = { pid: DEAD_PID, startedAt: new Date().toISOString() };
    });

    vi.advanceTimersByTime(WATCHDOG_MS);

    const reaped = store.read()[0];
    expect(reaped?.lock).toBeNull();
    expect(reaped?.status).toBe("error");
    expect(runner.runs).toHaveLength(0);
  });

  it("re-attempts an errored task after the user replies", () => {
    processor.setEnabled(true);
    const task = store.enqueue(blankTask());
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(runner.runs).toHaveLength(1);

    runner.runs[0]?.finish("boom");
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(store.read()[0]?.status).toBe("error");
    expect(runner.runs).toHaveLength(1);

    store.update(reply(task.id, "please try again"));
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.runs).toHaveLength(2);
    expect(store.read()[0]?.lock?.pid).toBe(FAKE_PID);
  });

  it("exposes the running task's live activity and clears it on exit", () => {
    processor.setEnabled(true);
    store.enqueue(blankTask());
    vi.advanceTimersByTime(DEBOUNCE_MS);

    runner.runs[0]?.emitActivity("Reading Order.ts");
    expect(processor.currentActivities()[0]?.text).toBe("Reading Order.ts");
    expect(processor.currentActivities()[0]?.taskId).toBe(store.read()[0]?.id);

    runner.runs[0]?.finish(null);
    expect(processor.currentActivities()).toEqual([]);
  });

  it("mints a session on the first run and resumes it on the next", () => {
    processor.setEnabled(true);
    const task = store.enqueue(blankTask());
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.sessions[0]?.resume).toBe(false);
    const sessionId = runner.sessions[0]?.sessionId;
    expect(sessionId).toBeTruthy();
    expect(store.read()[0]?.sessionId).toBe(sessionId);

    runner.runs[0]?.finish(null);
    store.update(reply(task.id, "tweak it"));
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.sessions[1]).toEqual({ sessionId, resume: true });
  });

  it("drops the session when a resumed run fails, so the next run cold-starts", () => {
    processor.setEnabled(true);
    const task = store.enqueue(blankTask());
    vi.advanceTimersByTime(DEBOUNCE_MS);
    runner.runs[0]?.finish(null);

    store.update(reply(task.id, "retry"));
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(runner.sessions[1]?.resume).toBe(true);

    runner.runs[1]?.finish("boom");
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(store.read()[0]?.sessionId).toBeNull();
  });

  it("accumulates token usage onto the task across runs", () => {
    processor.setEnabled(true);
    const task = store.enqueue(blankTask());
    vi.advanceTimersByTime(DEBOUNCE_MS);

    runner.runs[0]?.emitUsage({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      cacheCreationTokens: 3,
      costUsd: 0.01,
    });
    runner.runs[0]?.finish(null);

    store.update(reply(task.id, "tweak it"));
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    runner.runs[1]?.emitUsage({
      inputTokens: 50,
      outputTokens: 10,
      cacheReadTokens: 1,
      cacheCreationTokens: 0,
      costUsd: 0.005,
    });

    const usage = store.read()[0]?.usage;
    expect(usage?.inputTokens).toBe(150);
    expect(usage?.outputTokens).toBe(30);
    expect(usage?.runs).toBe(2);
    expect(usage?.costUsd).toBeCloseTo(0.015);
  });

  it("re-runs an edited request cold while keeping its accumulated usage", () => {
    processor.setEnabled(true);
    const task = store.enqueue(blankTask());
    vi.advanceTimersByTime(DEBOUNCE_MS);

    runner.runs[0]?.emitUsage({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0.01,
    });
    runner.runs[0]?.finish(null);
    expect(runner.sessions[0]?.resume).toBe(false);

    store.editRequest(task.id, "different ask");
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    // Editing the prompt drops the session, so the re-run cold-starts (no resume).
    expect(runner.runs).toHaveLength(2);
    expect(runner.sessions[1]?.resume).toBe(false);
    expect(runner.sessions[1]?.sessionId).not.toBe(runner.sessions[0]?.sessionId);

    runner.runs[1]?.emitUsage({
      inputTokens: 50,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0.005,
    });
    // The earlier run's tokens carry over — the total keeps climbing, not resets.
    const usage = store.read()[0]?.usage;
    expect(usage?.inputTokens).toBe(150);
    expect(usage?.runs).toBe(2);
    expect(usage?.costUsd).toBeCloseTo(0.015);
  });

  it("resumes a task's persisted session after a fresh processor starts (reopen)", () => {
    // Simulate the editor being closed mid-conversation: the queue file already holds a
    // task with a minted session and a trailing user message, but no live run.
    const task = store.enqueue(blankTask());
    store.mutate(task.id, (item) => {
      item.status = "proposed";
      item.sessionId = "persisted-session";
    });
    store.update(reply(task.id, "pick this back up"));

    // A brand-new processor (the reopened window) takes over the same store.
    const reopened = new AutoProcessor(() => root, store, runner);
    reopened.setEnabled(true);
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.sessions[0]).toEqual({ sessionId: "persisted-session", resume: true });
  });

  it("does nothing while disabled", () => {
    store.enqueue(blankTask());
    processor.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(runner.runs).toHaveLength(0);
  });

  it("restores the persisted opt-in so a reopened processor stays enabled", () => {
    // The user opted in; the choice is written to disk.
    processor.setEnabled(true);
    expect(fs.existsSync(path.join(root, ".visualise", "auto.json"))).toBe(true);

    // A brand-new processor (the reopened window) adopts the persisted opt-in and processes.
    const reopened = new AutoProcessor(() => root, store, runner);
    expect(reopened.status().enabled).toBe(false); // not yet restored
    reopened.restore();
    expect(reopened.status().enabled).toBe(true);

    store.enqueue(blankTask());
    reopened.notify();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(runner.runs).toHaveLength(1);
  });

  it("restore() leaves a never-enabled processor off", () => {
    const reopened = new AutoProcessor(() => root, store, runner);
    reopened.restore();
    expect(reopened.status().enabled).toBe(false);
  });

  it("persists the opt-out too, so a reopened processor stays off", () => {
    processor.setEnabled(true);
    processor.setEnabled(false);

    const reopened = new AutoProcessor(() => root, store, runner);
    reopened.restore();
    expect(reopened.status().enabled).toBe(false);
  });
});
