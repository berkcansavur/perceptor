import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class DeleteTaskCommand extends Command<Awaited<ReturnType<CoreService["deleteTask"]>>> {
  readonly action = "deleteTask";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["deleteTask"]> {
    return this.service.deleteTask(this.text(payload, "id"));
  }
}
