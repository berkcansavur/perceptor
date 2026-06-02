import { Command } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";
import type { ApiRequest } from "../types";

export class CreateCommand extends Command<ApiRequest["create"], Awaited<ReturnType<WorkspaceService["create"]>>> {
  readonly action = "create";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["create"] {
    const dir = this.text(payload, "dir");
    const name = this.text(payload, "name");
    if (this.text(payload, "kind") === "folder") {
      return { kind: "folder", dir, name };
    }
    return {
      kind: "file",
      dir,
      name,
      template: this.text(payload, "template", "empty"),
      typeName: this.text(payload, "typeName"),
      goPackage: this.text(payload, "goPackage"),
    };
  }

  protected run(request: ApiRequest["create"]): ReturnType<WorkspaceService["create"]> {
    return this.service.create(request);
  }
}
