import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class GraphCommand extends Command<Awaited<ReturnType<CoreService["graph"]>>> {
  readonly action = "graph";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(): ReturnType<CoreService["graph"]> {
    return this.service.graph();
  }
}
