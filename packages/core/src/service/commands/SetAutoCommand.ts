import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class SetAutoCommand extends Command<Awaited<ReturnType<CoreService["setAuto"]>>> {
  readonly action = "setAuto";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["setAuto"]> {
    return this.service.setAuto(this.flag(payload, "enabled"));
  }
}
