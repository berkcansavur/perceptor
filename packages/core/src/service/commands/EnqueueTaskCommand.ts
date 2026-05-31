import { Command } from "./Command";
import type { TaskService } from "../TaskService";
import type { ApiRequest } from "../types";
import { toEnqueuePayload } from "./payloadCoercion";

export class EnqueueTaskCommand extends Command<ApiRequest["enqueueTask"], Awaited<ReturnType<TaskService["enqueueTask"]>>> {
  readonly action = "enqueueTask";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["enqueueTask"] {
    return toEnqueuePayload(payload);
  }

  protected run(request: ApiRequest["enqueueTask"]): ReturnType<TaskService["enqueueTask"]> {
    return this.service.enqueueTask(request);
  }
}
