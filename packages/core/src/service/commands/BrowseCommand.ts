import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class BrowseCommand extends Command<Awaited<ReturnType<CoreService["browse"]>>> {
  readonly action = "browse";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["browse"]> {
    return this.service.browse(this.optionalText(payload, "path"));
  }
}
