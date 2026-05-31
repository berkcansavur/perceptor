import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class GetPreferencesCommand extends Command<Awaited<ReturnType<CoreService["getPreferences"]>>> {
  readonly action = "getPreferences";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(): ReturnType<CoreService["getPreferences"]> {
    return this.service.getPreferences();
  }
}
