import { Command } from "./Command";
import type { TaskService } from "../TaskService";
import type { ApiRequest } from "../types";

export class EditMessageCommand extends Command<ApiRequest["editMessage"], Awaited<ReturnType<TaskService["editMessage"]>>> {
  readonly action = "editMessage";

  constructor(private readonly service: TaskService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["editMessage"] {
    return { id: this.text(payload, "id"), index: this.count(payload, "index", 0), description: this.text(payload, "description") };
  }

  protected run(request: ApiRequest["editMessage"]): ReturnType<TaskService["editMessage"]> {
    return this.service.editMessage(request.id, request.index, request.description);
  }
}
