import { Command } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";
import type { ApiRequest } from "../types";

export class SourceCommand extends Command<ApiRequest["source"], Awaited<ReturnType<WorkspaceService["source"]>>> {
  readonly action = "source";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["source"] {
    return { file: this.text(payload, "file"), from: this.count(payload, "from", 1), to: this.count(payload, "to", 1) };
  }

  protected run(request: ApiRequest["source"]): ReturnType<WorkspaceService["source"]> {
    return this.service.source(request.file, request.from, request.to);
  }
}
