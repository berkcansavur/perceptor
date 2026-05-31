import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class FileTemplatesCommand extends Command<Awaited<ReturnType<CoreService["fileTemplates"]>>> {
  readonly action = "fileTemplates";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(): ReturnType<CoreService["fileTemplates"]> {
    return this.service.fileTemplates();
  }
}
