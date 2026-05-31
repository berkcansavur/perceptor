import { PayloadlessCommand } from "./Command";
import type { TaskService } from "../TaskService";

export class ListTasksCommand extends PayloadlessCommand<Awaited<ReturnType<TaskService["listTasks"]>>> {
  readonly action = "tasks";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected run(): ReturnType<TaskService["listTasks"]> {
    return this.service.listTasks();
  }
}
