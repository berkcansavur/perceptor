import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class ReanalyzeCommand extends Command<Awaited<ReturnType<CoreService["reanalyze"]>>> {
  readonly action = "reanalyze";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(): ReturnType<CoreService["reanalyze"]> {
    return this.service.reanalyze();
  }
}
