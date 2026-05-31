import { Command } from "./Command";
import type { TaskService } from "../TaskService";
import type { ApiRequest } from "../types";

export class DeleteTaskCommand extends Command<ApiRequest["deleteTask"], Awaited<ReturnType<TaskService["deleteTask"]>>> {
  readonly action = "deleteTask";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["deleteTask"] {
    return { id: this.text(payload, "id") };
  }

  protected run(request: ApiRequest["deleteTask"]): ReturnType<TaskService["deleteTask"]> {
    return this.service.deleteTask(request.id);
  }
}
