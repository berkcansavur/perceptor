import { Command } from "./Command";
import type { CoreService } from "../CoreService";

export class OpenFileCommand extends Command<Awaited<ReturnType<CoreService["openFile"]>>> {
  readonly action = "openFile";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["openFile"]> {
    return this.service.openFile(this.text(payload, "file"), this.count(payload, "line", 1));
  }
}
