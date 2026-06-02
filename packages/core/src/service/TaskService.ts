import { TaskStore } from "./task/TaskStore";
import { AutoProcessor } from "./processing/AutoProcessor";
import type { AutoActivity, AutoStatus, EnqueuePayload, Task, UpdatePayload } from "./types";

// The task lifecycle and its headless processing. Owns the TaskStore (the queue) and the
// AutoProcessor (the event-driven Claude runner). The cross-cutting invariant lives here in
// one place: every task mutation notifies the processor, so a new mutating path can't forget
// it. Lookups that miss throw a domain exception rather than returning null.
export class TaskService {
  private readonly tasks: TaskStore;
  private readonly autoProcessor: AutoProcessor;

  constructor(rootProvider: () => string, private readonly localeProvider: () => string) {
    this.tasks = new TaskStore(rootProvider);
    this.autoProcessor = new AutoProcessor(rootProvider, this.tasks);
  }

  // Re-adopt the persisted auto-processing opt-in (called once at startup).
  restoreAuto(): void {
    this.autoProcessor.restore();
  }

  listTasks(): { tasks: Task[] } {
    return { tasks: this.tasks.read() };
  }

  enqueueTask(payload: EnqueuePayload): { task: Task } {
    const enqueuedTask = this.tasks.enqueue(payload);
    this.autoProcessor.notify();
    return { task: enqueuedTask };
  }

  updateTask(payload: UpdatePayload): { task: Task } {
    const updatedTask = this.tasks.update(payload);
    this.autoProcessor.notify();
    return { task: updatedTask };
  }

  editRequest(id: string, description: string): { task: Task } {
    const editRequestTask = this.tasks.editRequest(id, description);
    this.autoProcessor.notify();
    return { task: editRequestTask };
  }

  editMessage(id: string, index: number, text: string): { task: Task } {
    const editMessageTask = this.tasks.editMessage(id, index, text);
    this.autoProcessor.notify();
    return { task: editMessageTask };
  }

  deleteTask(id: string): { id: string } {
    this.tasks.delete(id);
    return { id };
  }

  autoStatus(): AutoStatus {
    return this.autoProcessor.status();
  }

  setAuto(enabled: boolean): AutoStatus {
    return this.autoProcessor.setEnabled(enabled);
  }

  stopProcessing(taskId: string | null): AutoStatus {
    const stopped = this.localeProvider() === "tr" ? "⏹ Kullanıcı durdurdu." : "⏹ Stopped by user.";
    return this.autoProcessor.stop(stopped, taskId);
  }

  autoActivity(): { activities: AutoActivity[] } {
    return { activities: this.autoProcessor.currentActivities() };
  }
}
