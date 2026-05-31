import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class EditRequestCommand extends Command<Awaited<ReturnType<CoreService["editRequest"]>>> {
  readonly action = "editRequest";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["editRequest"]> {
    return this.service.editRequest(this.text(payload, "id"), this.text(payload, "description"));
  }
}
