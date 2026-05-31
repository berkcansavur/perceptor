import { Command } from "./Command";
import type { CoreService } from "../CoreService";
import type { CodingPreferences } from "../types";

export class SavePreferencesCommand extends Command<Awaited<ReturnType<CoreService["savePreferences"]>>> {
  readonly action = "savePreferences";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["savePreferences"]> {
    return this.service.savePreferences(payload as Partial<CodingPreferences>);
  }
}
