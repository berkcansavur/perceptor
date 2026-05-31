import { Command } from "./Command";
import type { TaskService } from "../TaskService";
import type { ApiRequest } from "../types";

export class StopProcessingCommand extends Command<ApiRequest["stopProcessing"], Awaited<ReturnType<TaskService["stopProcessing"]>>> {
  readonly action = "stopProcessing";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["stopProcessing"] {
    return { taskId: this.optionalText(payload, "taskId") };
  }

  protected run(request: ApiRequest["stopProcessing"]): ReturnType<TaskService["stopProcessing"]> {
    return this.service.stopProcessing(request.taskId);
  }
}
