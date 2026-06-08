import { Command } from "./Command";
import type { AnalysisService } from "../AnalysisService";
import type { SimulationEngine } from "../../core/SimulationEngine";
import type { ApiRequest, SimulationResult } from "../types";

export class SimulateCommand extends Command<ApiRequest["simulate"], SimulationResult> {
  readonly action = "simulate";

  constructor(
    private readonly analysis: AnalysisService,
    private readonly engine: SimulationEngine
  ) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["simulate"] {
    const base = { code: this.text(payload, "code"), name: this.text(payload, "name") };
    const file = this.optionalText(payload, "file");
    const env = payload["env"] as Record<string, unknown> | undefined;
    if (file && env) {
      return { ...base, file, env };
    }
    if (file) {
      return { ...base, file };
    }
    if (env) {
      return { ...base, env };
    }
    return base;
  }

  protected run(request: ApiRequest["simulate"]): SimulationResult {
    const { flow } = this.analysis.complexity(request.code, request.name, request.file);
    const metadata = this.engine.metadata(flow);
    const path = request.env
      ? this.engine.simulate(flow, this.engine.toEnv(request.env))
      : null;
    return { metadata, path };
  }
}
