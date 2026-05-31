import { Command } from "./Command";
import type { CoreService } from "../CoreService";
import { toUpdatePayload } from "./payloadCoercion";

export class UpdateTaskCommand extends Command<Awaited<ReturnType<CoreService["updateTask"]>>> {
  readonly action = "updateTask";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["updateTask"]> {
    return this.service.updateTask(toUpdatePayload(payload));
  }
}
