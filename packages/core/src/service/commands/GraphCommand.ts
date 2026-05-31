import { PayloadlessCommand } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";

export class GraphCommand extends PayloadlessCommand<Awaited<ReturnType<WorkspaceService["graph"]>>> {
  readonly action = "graph";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected run(): ReturnType<WorkspaceService["graph"]> {
    return this.service.graph();
  }
}
