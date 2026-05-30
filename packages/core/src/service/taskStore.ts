import * as fs from "fs";
import * as path from "path";
import { EnqueuePayload, Task, UpdatePayload } from "./types";

// Reads/writes the queue the UI and Claude share (.visualise/pending-actions.json).
export class TaskStore {
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
      return JSON.parse(fs.readFileSync(file, "utf8")) as Task[];
    } catch {
      return [];
    }
  }

  private write(tasks: readonly Task[]): void {
    const file = this.file();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(tasks, null, 2));
  }

  enqueue(payload: EnqueuePayload): Task {
    const tasks = this.read();
    const now = new Date().toISOString();
    const task: Task = {
      id: `t${Date.now()}${Math.floor(Math.random() * 1000)}`,
      type: payload.type ?? "move-behavior",
      status: "pending",
      from: payload.from ?? null,
      to: payload.to ?? null,
      spec: payload.spec ?? null,
      diff: null,
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
    if (payload.status !== undefined) {
      task.status = payload.status;
    }
    if (payload.diff !== undefined) {
      task.diff = payload.diff;
    }
    if (payload.commitMessage !== undefined) {
      task.commitMessage = payload.commitMessage;
    }
    if (payload.impact !== undefined) {
      task.impact = payload.impact;
    }
    if (payload.dismissed !== undefined) {
      task.dismissed = payload.dismissed;
    }
    if (payload.message) {
      task.messages.push({ role: payload.role ?? "user", text: payload.message, at: new Date().toISOString() });
    }
    task.updatedAt = new Date().toISOString();
    this.write(tasks);
    return task;
  }

  delete(id: string): void {
    this.write(this.read().filter((task) => task.id !== id));
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
