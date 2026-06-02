import { Command } from "./Command";
import type { AnalysisService } from "../AnalysisService";
import type { ApiRequest } from "../types";

export class ComplexityCommand extends Command<ApiRequest["complexity"], Awaited<ReturnType<AnalysisService["complexity"]>>> {
  readonly action = "complexity";

  constructor(private readonly service: AnalysisService) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["complexity"] {
    const base = { code: this.text(payload, "code"), name: this.text(payload, "name") };
    const file = this.optionalText(payload, "file");
    // Only attach `file` when present — exactOptionalPropertyTypes forbids an explicit
    // `file: undefined` against the optional `file?: string` field.
    return file === null ? base : { ...base, file };
  }

  protected run(request: ApiRequest["complexity"]): ReturnType<AnalysisService["complexity"]> {
    return this.service.complexity(request.code, request.name, request.file);
  }
}
