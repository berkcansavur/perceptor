import { Command } from "./Command";
import type { PreferencesService } from "../PreferencesService";
import type { ApiRequest } from "../types";
import { toCodingPreferences } from "./payloadCoercion";

export class SavePreferencesCommand extends Command<ApiRequest["savePreferences"], Awaited<ReturnType<PreferencesService["savePreferences"]>>> {
  readonly action = "savePreferences";

  constructor(private readonly service: PreferencesService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["savePreferences"] {
    return toCodingPreferences(payload);
  }

  protected run(request: ApiRequest["savePreferences"]): ReturnType<PreferencesService["savePreferences"]> {
    return this.service.savePreferences(request);
  }
}
