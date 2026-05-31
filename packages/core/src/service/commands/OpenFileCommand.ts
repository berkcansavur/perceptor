import { Command } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";
import type { ApiRequest } from "../types";

export class OpenFileCommand extends Command<ApiRequest["openFile"], Awaited<ReturnType<WorkspaceService["openFile"]>>> {
  readonly action = "openFile";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["openFile"] {
    return { file: this.text(payload, "file"), line: this.count(payload, "line", 1) };
  }

  protected run(request: ApiRequest["openFile"]): ReturnType<WorkspaceService["openFile"]> {
    return this.service.openFile(request.file, request.line);
  }
}
