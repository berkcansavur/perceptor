import { PayloadlessCommand } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";

export class GitStatusCommand extends PayloadlessCommand<Awaited<ReturnType<WorkspaceService["gitStatus"]>>> {
  readonly action = "gitStatus";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected run(): ReturnType<WorkspaceService["gitStatus"]> {
    return this.service.gitStatus();
  }
}
