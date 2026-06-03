import * as fs from "fs";
import * as path from "path";
import { Command } from "./Command";
import type { ApiRequest } from "../types";

export class UploadAttachmentCommand extends Command<ApiRequest["uploadAttachment"], { path: string }> {
  readonly action = "uploadAttachment";

  constructor(private readonly rootProvider: () => string) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["uploadAttachment"] {
    return {
      data: typeof payload["data"] === "string" ? payload["data"] : "",
      name: typeof payload["name"] === "string" ? payload["name"] : "image.png",
    };
  }

  protected run(request: ApiRequest["uploadAttachment"]): { path: string } {
    const root = this.rootProvider();
    const attachmentsDir = path.join(root, ".visualise", "attachments");
    fs.mkdirSync(attachmentsDir, { recursive: true });
    const safeName = request.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${Date.now()}-${safeName}`;
    const absolutePath = path.join(attachmentsDir, fileName);
    const base64Match = request.data.match(/^data:image\/\w+;base64,(.+)$/);
    const base64Data = base64Match && base64Match[1] ? base64Match[1] : request.data;
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(absolutePath, buffer);
    return { path: `.visualise/attachments/${fileName}` };
  }
}
