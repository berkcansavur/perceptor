import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class AutoActivityCommand extends Command<Awaited<ReturnType<CoreService["autoActivity"]>>> {
  readonly action = "autoActivity";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(): ReturnType<CoreService["autoActivity"]> {
    return this.service.autoActivity();
  }
}
