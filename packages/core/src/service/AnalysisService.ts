import { ComplexityAnalyzer } from "../core/ComplexityAnalyzer";
import type { ComplexityReport } from "./types";

// Static code analysis surfaced to the UI. Pure: no disk, no tokens, deterministic. The
// natural home for further per-language analysis (the v2 "pattern suggestions" idea).
export class AnalysisService {
  private readonly complexityAnalyzer = new ComplexityAnalyzer();

  complexity(code: string, name: string): { report: ComplexityReport } {
    return { report: this.complexityAnalyzer.analyze(code, name) };
  }
}
