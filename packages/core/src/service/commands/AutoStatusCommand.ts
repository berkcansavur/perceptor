import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class AutoStatusCommand extends Command<Awaited<ReturnType<CoreService["autoStatus"]>>> {
  readonly action = "autoStatus";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(): ReturnType<CoreService["autoStatus"]> {
    return this.service.autoStatus();
  }
}
