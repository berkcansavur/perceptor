import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class EditMessageCommand extends Command<Awaited<ReturnType<CoreService["editMessage"]>>> {
  readonly action = "editMessage";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["editMessage"]> {
    return this.service.editMessage(this.text(payload, "id"), this.count(payload, "index", 0), this.text(payload, "description"));
  }
}
