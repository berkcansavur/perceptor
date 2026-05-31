import { Command } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";
import type { ApiRequest } from "../types";

export class OpenCommand extends Command<ApiRequest["open"], Awaited<ReturnType<WorkspaceService["open"]>>> {
  readonly action = "open";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["open"] {
    return { path: this.text(payload, "path") };
  }

  protected run(request: ApiRequest["open"]): ReturnType<WorkspaceService["open"]> {
    return this.service.open(request.path);
  }
}
