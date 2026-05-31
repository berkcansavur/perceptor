import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class SourceCommand extends Command<Awaited<ReturnType<CoreService["source"]>>> {
  readonly action = "source";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["source"]> {
    return this.service.source(this.text(payload, "file"), this.count(payload, "from", 1), this.count(payload, "to", 1));
  }
}
