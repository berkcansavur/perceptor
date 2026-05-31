import { Command } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";
import type { ApiRequest } from "../types";

export class BrowseCommand extends Command<ApiRequest["browse"], Awaited<ReturnType<WorkspaceService["browse"]>>> {
  readonly action = "browse";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["browse"] {
    return { path: this.optionalText(payload, "path") };
  }

  protected run(request: ApiRequest["browse"]): ReturnType<WorkspaceService["browse"]> {
    return this.service.browse(request.path);
  }
}
