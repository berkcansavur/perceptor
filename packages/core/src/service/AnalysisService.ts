import { ComplexityAnalyzer } from "../core/ComplexityAnalyzer";
import { FlowAnalyzer } from "../core/FlowAnalyzer";
import { flowAdapterForFile } from "../core/flow/FlowLanguageAdapter";
import { QueryAnalyzer } from "../core/QueryAnalyzer";
import type { ComplexityReport, FlowReport, QueryReport } from "./types";

// Static code analysis surfaced to the UI. Pure: no disk, no tokens, deterministic. The
// natural home for further per-language analysis (the v2 "pattern suggestions" idea).
export class AnalysisService {
  private readonly complexityAnalyzer = new ComplexityAnalyzer();
  private readonly queryAnalyzer = new QueryAnalyzer();
  private readonly flowAnalyzer = new FlowAnalyzer();

  // Complexity, data-access risk and the run-flow storyboard share one round trip and one
  // source read. The query pass reuses the complexity report's loop depth to decide whether
  // a DB call is an N+1; the flow pass reads the same text into an ordered call story.
  complexity(
    code: string,
    name: string,
    file?: string
  ): { report: ComplexityReport; query: QueryReport; flow: FlowReport } {
    const report = this.complexityAnalyzer.analyze(code, name, file);
    const query = this.queryAnalyzer.analyze(code, file, report.loopDepth);
    const flow = this.flowAnalyzer.analyze(code, name, flowAdapterForFile(file));
    return { report, query, flow };
  }
}
