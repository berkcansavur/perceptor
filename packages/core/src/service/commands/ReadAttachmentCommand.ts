import * as fs from "fs";
import * as path from "path";
import { Command } from "./Command";
import type { ApiRequest } from "../types";

export class ReadAttachmentCommand extends Command<ApiRequest["readAttachment"], { dataUrl: string }> {
  readonly action = "readAttachment";

  constructor(private readonly rootProvider: () => string) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["readAttachment"] {
    return { path: typeof payload["path"] === "string" ? payload["path"] : "" };
  }

  protected run(request: ApiRequest["readAttachment"]): { dataUrl: string } {
    const absolutePath = path.resolve(this.rootProvider(), request.path);
    const attachmentsDir = path.resolve(this.rootProvider(), ".perceptor", "attachments");
    if (!absolutePath.startsWith(attachmentsDir) || !fs.existsSync(absolutePath)) {
      return { dataUrl: "" };
    }
    const buffer = fs.readFileSync(absolutePath);
    const extension = path.extname(absolutePath).slice(1).toLowerCase();
    const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg"
      : extension === "gif" ? "image/gif"
      : extension === "webp" ? "image/webp"
      : "image/png";
    return { dataUrl: `data:${mime};base64,${buffer.toString("base64")}` };
  }
}
