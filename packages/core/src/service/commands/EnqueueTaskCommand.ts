import { Command } from "./Command";
import type { CoreService } from "../CoreService";
import { toEnqueuePayload } from "./payloadCoercion";

export class EnqueueTaskCommand extends Command<Awaited<ReturnType<CoreService["enqueueTask"]>>> {
  readonly action = "enqueueTask";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["enqueueTask"]> {
    return this.service.enqueueTask(toEnqueuePayload(payload));
  }
}
