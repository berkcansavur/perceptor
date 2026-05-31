import { Command } from "./Command";
import type { TaskService } from "../TaskService";
import type { ApiRequest } from "../types";
import { toUpdatePayload } from "./payloadCoercion";

export class UpdateTaskCommand extends Command<ApiRequest["updateTask"], Awaited<ReturnType<TaskService["updateTask"]>>> {
  readonly action = "updateTask";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["updateTask"] {
    return toUpdatePayload(payload);
  }

  protected run(request: ApiRequest["updateTask"]): ReturnType<TaskService["updateTask"]> {
    return this.service.updateTask(request);
  }
}
