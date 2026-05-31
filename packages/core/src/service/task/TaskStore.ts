import * as fs from "fs";
import * as path from "path";
import { EnqueuePayload, RunResult, Task, TaskArtifact, TaskImpact, TaskLifecycle, TaskMessage, TaskMeta, UpdatePayload } from "../types";
import { coerceKind } from "./taskCoercion";
import { RequestNotFoundException, TaskNotFoundException } from "../exception";

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
      artifact: this.artifactOf(raw),
    };
  }

  // Prefer the canonical `artifact` union; fall back to the legacy flat diff/impact/
  // commitMessage fields so a queue written before this format still loads.
  private artifactOf(raw: Record<string, unknown>): TaskArtifact {
    const artifact = raw["artifact"] as TaskArtifact | undefined;
    if (artifact && artifact.kind) {
      return artifact;
    }
    const diff = raw["diff"];
    const impact = raw["impact"] as TaskImpact | undefined;
    if (typeof diff !== "string" || !impact) {
      return { kind: "none" };
    }
    const commitMessage = raw["commitMessage"];
    if (typeof commitMessage === "string") {
      return { kind: "applied", diff, impact, commitMessage };
    }
    return { kind: "proposed", diff, impact };
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
      artifact: { kind: "none" },
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

  // Apply one update intent from the webview. A miss throws rather than returning null,
  // so the caller works with a real Task; each intent touches only the fields it owns.
  update(payload: UpdatePayload): Task {
    const tasks = this.read();
    const updatedTask = tasks.find((item) => item.id === payload.id);
    if (!updatedTask) {
      throw new TaskNotFoundException(payload.id);
    }
    this.applyUpdate(updatedTask, payload);
    updatedTask.updatedAt = new Date().toISOString();
    this.write(tasks);
    return updatedTask;
  }

  private applyUpdate(task: Task, payload: UpdatePayload): void {
    switch (payload.intent) {
      case "set-status":
        task.status = payload.status;
        return;
      case "reply":
        task.messages.push({ role: "user", text: payload.message, at: new Date().toISOString() });
        // A user reply re-opens the auto gate so the processor gives Claude a fresh
        // attempt (re-send after an error / asking for a revision).
        task.auto = null;
        return;
      case "dismiss":
        task.dismissed = true;
        return;
    }
  }

  // Rewrite a chat request's prompt (the "edit message" affordance) and reset it to
  // re-run from scratch: the prior proposal, thread, and session are stale once the
  // ask changes, so we cold-start (sessionId cleared → the next run mints a fresh
  // session). `usage` is deliberately left untouched so the accumulated token total
  // keeps climbing across the edit instead of resetting — the earlier run's tokens
  // were really spent, and the re-run adds onto them.
  editRequest(id: string, description: string): Task {
    const tasks = this.read();
    const editRequestTask = tasks.find((item) => item.id === id);
    if (!editRequestTask || editRequestTask.type !== "request") {
      throw new RequestNotFoundException(id);
    }
    editRequestTask.spec = { description };
    editRequestTask.status = "pending";
    editRequestTask.artifact = { kind: "none" };
    editRequestTask.auto = null;
    editRequestTask.sessionId = null;
    editRequestTask.messages = [];
    editRequestTask.updatedAt = new Date().toISOString();
    this.write(tasks);
    return editRequestTask;
  }

  // Edit a message already in a request's thread and re-run from that point: the text
  // is rewritten, every later turn (Claude's reply and anything after) is dropped, and
  // the task resets to re-run cold from the corrected conversation. `usage` is kept so
  // the token total keeps climbing across the edit. Only user messages are editable.
  editMessage(id: string, index: number, text: string): Task {
    const tasks = this.read();
    const editMessageTask = tasks.find((item) => item.id === id);
    if (!editMessageTask || editMessageTask.type !== "request") {
      throw new RequestNotFoundException(id);
    }
    const message = editMessageTask.messages[index];
    if (!message || message.role !== "user") {
      throw new RequestNotFoundException(id);
    }
    message.text = text;
    editMessageTask.messages = editMessageTask.messages.slice(0, index + 1);
    editMessageTask.status = "pending";
    editMessageTask.artifact = { kind: "none" };
    editMessageTask.auto = null;
    editMessageTask.sessionId = null;
    editMessageTask.updatedAt = new Date().toISOString();
    this.write(tasks);
    return editMessageTask;
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
          task.artifact = { kind: "proposed", diff: result.diff, impact: result.impact };
          return;
        case "applied":
          task.status = "applied";
          task.artifact = { kind: "applied", diff: result.diff, impact: result.impact, commitMessage: result.commitMessage };
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
