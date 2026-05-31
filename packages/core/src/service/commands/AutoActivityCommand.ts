import { PayloadlessCommand } from "./Command";
import type { TaskService } from "../TaskService";

export class AutoActivityCommand extends PayloadlessCommand<Awaited<ReturnType<TaskService["autoActivity"]>>> {
  readonly action = "autoActivity";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected run(): ReturnType<TaskService["autoActivity"]> {
    return this.service.autoActivity();
  }
}
