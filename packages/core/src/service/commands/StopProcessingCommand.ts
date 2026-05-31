import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class StopProcessingCommand extends Command<Awaited<ReturnType<CoreService["stopProcessing"]>>> {
  readonly action = "stopProcessing";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["stopProcessing"]> {
    return this.service.stopProcessing(this.optionalText(payload, "taskId"));
  }
}
