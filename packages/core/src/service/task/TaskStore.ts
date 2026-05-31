import * as fs from "fs";
import * as path from "path";
import { EnqueuePayload, RunResult, Task, TaskLifecycle, TaskMessage, TaskMeta, UpdatePayload } from "../types";
import { coerceKind } from "./taskCoercion";

// Reads/writes the queue the UI and Claude share (.visualise/pending-actions.json).
export class TaskStore {
  // Monotonic so two tasks enqueued in the same millisecond can't collide on id.
  private sequence = 0;

  constructor(private readonly rootProvider: () => string) {}

  private file(): string {
    return path.join(this.rootProvider(), ".visualise", "pending-actions.json");
  }

  read(): Task[] {
    const file = this.file();
    if (!fs.existsSync(file)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>[];
      return raw.map((task) => this.normalize(task));
    } catch {
      return [];
    }
  }

  // Rebuild a fully-typed Task from loose JSON: the discriminated kind via coerceKind,
  // then the lifecycle/meta fields (absent ones default, never `undefined`).
  private normalize(raw: Record<string, unknown>): Task {
    const kind = coerceKind(raw["type"], raw["from"], raw["to"], raw["spec"]);
    return { ...kind, ...this.lifecycleOf(raw), ...this.metaOf(raw) };
  }

  private lifecycleOf(raw: Record<string, unknown>): TaskLifecycle {
    return {
      status: (raw["status"] as TaskLifecycle["status"]) ?? "pending",
      diff: (raw["diff"] as string | null) ?? null,
      impact: (raw["impact"] as TaskLifecycle["impact"]) ?? null,
      commitMessage: (raw["commitMessage"] as string | null) ?? null,
    };
  }

  private metaOf(raw: Record<string, unknown>): TaskMeta {
    return {
      id: (raw["id"] as string) ?? "",
      dismissed: (raw["dismissed"] as boolean) ?? false,
      lock: (raw["lock"] as TaskMeta["lock"]) ?? null,
      auto: (raw["auto"] as TaskMeta["auto"]) ?? null,
      usage: (raw["usage"] as TaskMeta["usage"]) ?? null,
      sessionId: (raw["sessionId"] as string | null) ?? null,
      messages: (raw["messages"] as TaskMessage[]) ?? [],
      createdAt: (raw["createdAt"] as string) ?? "",
      updatedAt: (raw["updatedAt"] as string) ?? "",
    };
  }

  // Atomic write (tmp + rename) so a concurrent reader — the running Claude process
  // reading the queue — never observes a half-written file.
  private write(tasks: readonly Task[]): void {
    const file = this.file();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2));
    fs.renameSync(tmp, file);
  }

  enqueue(payload: EnqueuePayload): Task {
    const tasks = this.read();
    const now = new Date().toISOString();
    const task: Task = {
      ...payload,
      status: "pending",
      diff: null,
      impact: null,
      commitMessage: null,
      id: `t${Date.now()}-${(this.sequence += 1)}`,
      dismissed: false,
      lock: null,
      auto: null,
      usage: null,
      sessionId: null,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(task);
    this.write(tasks);
    return task;
  }

  update(payload: UpdatePayload): Task | null {
    const tasks = this.read();
    const task = tasks.find((item) => item.id === payload.id);
    if (!task) {
      return null;
    }
    if (payload.status !== null) {
      task.status = payload.status;
    }
    if (payload.diff !== null) {
      task.diff = payload.diff;
    }
    if (payload.commitMessage !== null) {
      task.commitMessage = payload.commitMessage;
    }
    if (payload.impact !== null) {
      task.impact = payload.impact;
    }
    if (payload.dismissed !== null) {
      task.dismissed = payload.dismissed;
    }
    if (payload.message !== null) {
      const role = payload.role ?? "user";
      task.messages.push({ role, text: payload.message, at: new Date().toISOString() });
      // A user reply re-opens the auto gate so the processor gives Claude a fresh
      // attempt (re-send after an error / asking for a revision).
      if (role === "user") {
        task.auto = null;
      }
    }
    task.updatedAt = new Date().toISOString();
    this.write(tasks);
    return task;
  }

  // Rewrite a chat request's prompt (the "edit message" affordance) and reset it to
  // re-run from scratch: the prior proposal, thread, and session are stale once the
  // ask changes, so we cold-start (sessionId cleared → the next run mints a fresh
  // session). `usage` is deliberately left untouched so the accumulated token total
  // keeps climbing across the edit instead of resetting — the earlier run's tokens
  // were really spent, and the re-run adds onto them.
  editRequest(id: string, description: string): Task | null {
    const tasks = this.read();
    const task = tasks.find((item) => item.id === id);
    if (!task || task.type !== "request") {
      return null;
    }
    task.spec = { description };
    task.status = "pending";
    task.diff = null;
    task.impact = null;
    task.commitMessage = null;
    task.auto = null;
    task.sessionId = null;
    task.messages = [];
    task.updatedAt = new Date().toISOString();
    this.write(tasks);
    return task;
  }

  // Edit a message already in a request's thread and re-run from that point: the text
  // is rewritten, every later turn (Claude's reply and anything after) is dropped, and
  // the task resets to re-run cold from the corrected conversation. `usage` is kept so
  // the token total keeps climbing across the edit. Only user messages are editable.
  editMessage(id: string, index: number, text: string): Task | null {
    const tasks = this.read();
    const task = tasks.find((item) => item.id === id);
    if (!task || task.type !== "request") {
      return null;
    }
    const message = task.messages[index];
    if (!message || message.role !== "user") {
      return null;
    }
    message.text = text;
    task.messages = task.messages.slice(0, index + 1);
    task.status = "pending";
    task.diff = null;
    task.impact = null;
    task.commitMessage = null;
    task.auto = null;
    task.sessionId = null;
    task.updatedAt = new Date().toISOString();
    this.write(tasks);
    return task;
  }

  delete(id: string): void {
    this.write(this.read().filter((task) => task.id !== id));
  }

  // Fold a headless run's outcome (from its per-task result file) into the queue.
  // The host is the only writer here, so concurrent runs never race on the queue.
  // Each outcome carries exactly the fields it sets — the switch never touches others.
  mergeResult(id: string, result: RunResult): void {
    this.mutate(id, (task) => {
      for (const message of result.messages) {
        task.messages.push(message);
      }
      switch (result.kind) {
        case "proposed":
          task.status = "proposed";
          task.diff = result.diff;
          task.impact = result.impact;
          return;
        case "applied":
          task.status = "applied";
          task.diff = result.diff;
          task.impact = result.impact;
          task.commitMessage = result.commitMessage;
          return;
        case "described":
          task.status = "applied";
          task.dismissed = true;
          return;
        case "error":
          task.status = "error";
          return;
        case "clarify":
          // A question only — status is unchanged; the appended message is enough.
          return;
      }
    });
  }

  // Apply an in-place change to one task and persist (used by the auto-processor
  // for lock/attempt bookkeeping).
  mutate(id: string, mutator: (task: Task) => void): void {
    const tasks = this.read();
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    mutator(task);
    task.updatedAt = new Date().toISOString();
    this.write(tasks);
  }
}
