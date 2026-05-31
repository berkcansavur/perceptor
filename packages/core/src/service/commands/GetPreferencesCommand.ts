import { PayloadlessCommand } from "./Command";
import type { PreferencesService } from "../PreferencesService";

export class GetPreferencesCommand extends PayloadlessCommand<Awaited<ReturnType<PreferencesService["getPreferences"]>>> {
  readonly action = "getPreferences";

  constructor(private readonly service: PreferencesService) {
    super();
  }

  protected run(): ReturnType<PreferencesService["getPreferences"]> {
    return this.service.getPreferences();
  }
}
