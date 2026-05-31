import { PayloadlessCommand } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";

export class FileTemplatesCommand extends PayloadlessCommand<Awaited<ReturnType<WorkspaceService["fileTemplates"]>>> {
  readonly action = "fileTemplates";

  constructor(private readonly service: WorkspaceService) {
    super();
  }

  protected run(): ReturnType<WorkspaceService["fileTemplates"]> {
    return this.service.fileTemplates();
  }
}
