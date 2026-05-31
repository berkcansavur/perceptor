import { Command } from "./Command";
import type { PreferencesService } from "../PreferencesService";
import type { ApiRequest } from "../types";

export class SetLocaleCommand extends Command<ApiRequest["setLocale"], Awaited<ReturnType<PreferencesService["setLocale"]>>> {
  readonly action = "setLocale";

  constructor(private readonly service: PreferencesService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["setLocale"] {
    return { locale: this.text(payload, "locale") };
  }

  protected run(request: ApiRequest["setLocale"]): ReturnType<PreferencesService["setLocale"]> {
    return this.service.setLocale(request.locale);
  }
}
