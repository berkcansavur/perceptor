import * as vscode from "vscode";
import type { CoreService } from "perceptor-core/dist/service";

type BehaviorInfo = {
  readonly name: string;
  readonly line: number;
  readonly endLine: number;
};

type ClassNodeInfo = {
  readonly name: string;
  readonly file: string;
  readonly behaviors: readonly BehaviorInfo[];
};

type GraphData = {
  readonly nodes: readonly ClassNodeInfo[];
};

type MethodReadinessInfo = {
  readonly behavior: string;
  readonly status: "tested" | "untested";
};

type ClassDebugReportInfo = {
  readonly className: string;
  readonly file: string;
  readonly methods: readonly MethodReadinessInfo[];
  readonly debuggablePercent: number;
};

const STATUS_ICON: Record<string, string> = {
  tested: "$(beaker)",
  untested: "$(warning)",
};

export class InlineDebuggerCodeLens implements vscode.CodeLensProvider {
  private cachedGraph: GraphData | null = null;
  private cachedReadiness = new Map<string, ClassDebugReportInfo>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;
  private readonly testWatcher: vscode.FileSystemWatcher;

  constructor(private readonly coreProvider: () => CoreService | undefined) {
    // When a test file appears/changes (e.g. a generated test is approved), the
    // tested/untested badges are stale — refresh readiness so they update live.
    this.testWatcher = vscode.workspace.createFileSystemWatcher("**/*.{test,spec,Test,Tests}.{ts,tsx,js,jsx,cs,java}");
    this.testWatcher.onDidCreate(() => this.invalidateReadiness());
    this.testWatcher.onDidChange(() => this.invalidateReadiness());
    this.testWatcher.onDidDelete(() => this.invalidateReadiness());
  }

  private invalidateReadiness(): void {
    this.cachedReadiness.clear();
    this.changeEmitter.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const core = this.coreProvider();
    if (!core) {
      return [];
    }

    const graph = await this.loadGraph(core);
    await this.loadReadiness(core);
    const relativePath = vscode.workspace.asRelativePath(document.uri, false);
    const lenses: vscode.CodeLens[] = [];

    for (const node of graph.nodes) {
      if (node.file !== relativePath) {
        continue;
      }
      const report = this.cachedReadiness.get(`${node.file}::${node.name}`);
      for (const behavior of node.behaviors) {
        const position = new vscode.Position(behavior.line - 1, 0);
        const range = new vscode.Range(position, position);
        const readinessMethod = report?.methods.find((methodReadiness) => methodReadiness.behavior === behavior.name);
        const statusLabel = readinessMethod ? `${STATUS_ICON[readinessMethod.status] ?? ""} ${readinessMethod.status}` : "";
        const debugTitle = statusLabel
          ? `$(debug-start) Debug with Perceptor  |  ${statusLabel}`
          : "$(debug-start) Debug with Perceptor";
        lenses.push(
          new vscode.CodeLens(range, {
            title: debugTitle,
            tooltip: readinessMethod
              ? `Debug readiness: ${readinessMethod.status}`
              : "Debug this method with real execution and breakpoints",
            command: "perceptor.simulate",
            arguments: [document.uri, behavior.name, behavior.line, behavior.endLine, node.file, node.name],
          })
        );
      }
    }

    return lenses;
  }

  private async loadGraph(core: CoreService): Promise<GraphData> {
    if (this.cachedGraph) {
      return this.cachedGraph;
    }
    const response = await core.dispatch("graph", {});
    if (!response.success) {
      return { nodes: [] };
    }
    this.cachedGraph = response.data as GraphData;
    return this.cachedGraph;
  }

  private async loadReadiness(core: CoreService): Promise<void> {
    if (this.cachedReadiness.size > 0) {
      return;
    }
    const response = await core.dispatch("debugReadiness", {});
    if (!response.success) {
      return;
    }
    const reports = response.data as ClassDebugReportInfo[];
    for (const report of reports) {
      this.cachedReadiness.set(`${report.file}::${report.className}`, report);
    }
  }

  invalidate(): void {
    this.cachedGraph = null;
    this.cachedReadiness.clear();
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.testWatcher.dispose();
    this.changeEmitter.dispose();
  }
}
