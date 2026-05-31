import { PayloadlessCommand } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";

export class MetaCommand extends PayloadlessCommand<Awaited<ReturnType<WorkspaceService["meta"]>>> {
  readonly action = "meta";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected run(): ReturnType<WorkspaceService["meta"]> {
    return this.service.meta();
  }
}
