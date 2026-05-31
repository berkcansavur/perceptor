import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class BehaviorSummaryCommand extends Command<Awaited<ReturnType<CoreService["behaviorSummary"]>>> {
  readonly action = "behaviorSummary";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["behaviorSummary"]> {
    return this.service.behaviorSummary(this.text(payload, "file"), this.text(payload, "behavior"));
  }
}
