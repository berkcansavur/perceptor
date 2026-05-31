import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class OpenCommand extends Command<Awaited<ReturnType<CoreService["open"]>>> {
  readonly action = "open";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["open"]> {
    return this.service.open(this.text(payload, "path"));
  }
}
