import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class ListTasksCommand extends Command<Awaited<ReturnType<CoreService["listTasks"]>>> {
  readonly action = "tasks";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(): ReturnType<CoreService["listTasks"]> {
    return this.service.listTasks();
  }
}
