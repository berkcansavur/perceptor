import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class MetaCommand extends Command<Awaited<ReturnType<CoreService["meta"]>>> {
  readonly action = "meta";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(): ReturnType<CoreService["meta"]> {
    return this.service.meta();
  }
}
