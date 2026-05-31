import { Command } from "./Command";
import type { TaskService } from "../TaskService";
import type { ApiRequest } from "../types";

export class SetAutoCommand extends Command<ApiRequest["setAuto"], Awaited<ReturnType<TaskService["setAuto"]>>> {
  readonly action = "setAuto";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["setAuto"] {
    return { enabled: this.flag(payload, "enabled") };
  }

  protected run(request: ApiRequest["setAuto"]): ReturnType<TaskService["setAuto"]> {
    return this.service.setAuto(request.enabled);
  }
}
