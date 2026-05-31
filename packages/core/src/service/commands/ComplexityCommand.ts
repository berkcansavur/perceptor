import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class ComplexityCommand extends Command<Awaited<ReturnType<CoreService["complexity"]>>> {
  readonly action = "complexity";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["complexity"]> {
    return this.service.complexity(this.text(payload, "code"), this.text(payload, "name"));
  }
}
