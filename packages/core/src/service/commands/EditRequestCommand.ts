import { Command } from "./Command";
import type { TaskService } from "../TaskService";
import type { ApiRequest } from "../types";

export class EditRequestCommand extends Command<ApiRequest["editRequest"], Awaited<ReturnType<TaskService["editRequest"]>>> {
  readonly action = "editRequest";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["editRequest"] {
    return { id: this.text(payload, "id"), description: this.text(payload, "description") };
  }

  protected run(request: ApiRequest["editRequest"]): ReturnType<TaskService["editRequest"]> {
    return this.service.editRequest(request.id, request.description);
  }
}
