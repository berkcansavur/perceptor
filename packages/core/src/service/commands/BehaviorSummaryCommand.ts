import { Command } from "./Command";
import type { PreferencesService } from "../PreferencesService";
import type { ApiRequest } from "../types";

export class BehaviorSummaryCommand extends Command<ApiRequest["behaviorSummary"], Awaited<ReturnType<PreferencesService["behaviorSummary"]>>> {
  readonly action = "behaviorSummary";

  constructor(private readonly service: PreferencesService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["behaviorSummary"] {
    return { file: this.text(payload, "file"), behavior: this.text(payload, "behavior") };
  }

  protected run(request: ApiRequest["behaviorSummary"]): ReturnType<PreferencesService["behaviorSummary"]> {
    return this.service.behaviorSummary(request.file, request.behavior);
  }
}
