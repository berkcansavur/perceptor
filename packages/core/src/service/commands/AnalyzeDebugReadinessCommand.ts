import { PayloadlessCommand } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";
import type { DebugReadinessAnalyzer } from "../../core/DebugReadinessAnalyzer";
import type { ClassDebugReport } from "../types";

export class AnalyzeDebugReadinessCommand extends PayloadlessCommand<ClassDebugReport[]> {
  readonly action = "debugReadiness";

  constructor(
    private readonly workspace: WorkspaceService,
    private readonly analyzer: DebugReadinessAnalyzer
  ) {
    super();
  }

  protected run(): ClassDebugReport[] {
    const graph = this.workspace.graph();
    if (!graph) {
      return [];
    }
    const rootDir = this.workspace.root();
    return graph.nodes.map((node) => this.analyzer.analyzeClass(node, rootDir));
  }
}
