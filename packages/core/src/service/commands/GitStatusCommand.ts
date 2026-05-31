import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class GitStatusCommand extends Command<Awaited<ReturnType<CoreService["gitStatus"]>>> {
  readonly action = "gitStatus";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(): ReturnType<CoreService["gitStatus"]> {
    return this.service.gitStatus();
  }
}
