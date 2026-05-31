import { Command } from "./Command";
import type { CoreService, CreatePayload } from "../CoreService";

export class CreateCommand extends Command<Awaited<ReturnType<CoreService["create"]>>> {
  readonly action = "create";

  constructor(private readonly service: CoreService) {
    super();
  }

  handle(payload: Record<string, unknown>): ReturnType<CoreService["create"]> {
    const kind = this.text(payload, "kind");
    const created: CreatePayload = {
      kind: kind === "folder" ? "folder" : kind === "file" ? "file" : null,
      dir: this.optionalText(payload, "dir"),
      name: this.optionalText(payload, "name"),
      template: this.optionalText(payload, "template"),
      typeName: this.optionalText(payload, "typeName"),
    };
    return this.service.create(created);
  }
}
