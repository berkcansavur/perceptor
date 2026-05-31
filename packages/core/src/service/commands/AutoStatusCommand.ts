import { PayloadlessCommand } from "./Command";
import type { TaskService } from "../TaskService";

export class AutoStatusCommand extends PayloadlessCommand<Awaited<ReturnType<TaskService["autoStatus"]>>> {
  readonly action = "autoStatus";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected run(): ReturnType<TaskService["autoStatus"]> {
    return this.service.autoStatus();
  }
}
