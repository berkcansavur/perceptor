import { PayloadlessCommand } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";

export class ReanalyzeCommand extends PayloadlessCommand<Awaited<ReturnType<WorkspaceService["reanalyze"]>>> {
  readonly action = "reanalyze";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected run(): ReturnType<WorkspaceService["reanalyze"]> {
    return this.service.reanalyze();
  }
}
