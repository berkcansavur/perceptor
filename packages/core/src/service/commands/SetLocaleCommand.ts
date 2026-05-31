import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class SetLocaleCommand extends Command<Awaited<ReturnType<CoreService["setLocale"]>>> {
  readonly action = "setLocale";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["setLocale"]> {
    return this.service.setLocale(this.text(payload, "locale"));
  }
}
