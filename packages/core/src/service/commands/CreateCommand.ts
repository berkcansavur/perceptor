import { Command } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";
import type { ApiRequest } from "../types";

export class CreateCommand extends Command<ApiRequest["create"], Awaited<ReturnType<WorkspaceService["create"]>>> {
  readonly action = "create";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["create"] {
    const kind = this.text(payload, "kind");
    return {
      kind: kind === "folder" ? "folder" : kind === "file" ? "file" : null,
      dir: this.optionalText(payload, "dir"),
      name: this.optionalText(payload, "name"),
      template: this.optionalText(payload, "template"),
      typeName: this.optionalText(payload, "typeName"),
    };
  }

  protected run(request: ApiRequest["create"]): ReturnType<WorkspaceService["create"]> {
    return this.service.create(request);
  }
}
