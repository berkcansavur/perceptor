import { Command } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";
import { DebugReadinessAnalyzer } from "../../core/DebugReadinessAnalyzer";
import type { ApiRequest, DebugRunnerResult } from "../types";
import type { TestDiscovery } from "../../core/TestDiscovery";
import type { Parameter } from "../../core/types";
import { UnsupportedActionException } from "../exception/UnsupportedActionException";
import { SourceNotFoundException } from "../exception/SourceNotFoundException";

// Resolves a method's debug readiness: whether a test covers it (and which file +
// framework), plus a seeded default payload used to label the editable parameters.
// Debugging itself runs the real test — this command no longer generates a runner.
export class GenerateDebugRunnerCommand extends Command<ApiRequest["generateDebugRunner"], DebugRunnerResult> {
  readonly action = "generateDebugRunner";

  constructor(
    private readonly workspace: WorkspaceService,
    private readonly readinessAnalyzer: DebugReadinessAnalyzer,
    private readonly testDiscovery: TestDiscovery
  ) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["generateDebugRunner"] {
    return {
      file: this.text(payload, "file"),
      className: this.text(payload, "className"),
      methodName: this.text(payload, "methodName"),
      payload: (payload["payload"] as Record<string, unknown>) ?? {},
    };
  }

  protected run(request: ApiRequest["generateDebugRunner"]): DebugRunnerResult {
    const graph = this.workspace.graph();
    if (!graph) {
      throw new UnsupportedActionException("generateDebugRunner — analyze the repository first");
    }

    const node = graph.nodes.find(
      (n) => n.file === request.file && n.name === request.className
    );
    if (!node) {
      throw new SourceNotFoundException(`${request.className} in ${request.file}`);
    }

    const behavior = node.behaviors.find((b) => b.name === request.methodName);
    if (!behavior) {
      throw new SourceNotFoundException(`${request.methodName} in ${request.className}`);
    }

    const rootDir = this.workspace.root();
    const readiness = this.readinessAnalyzer.analyze(node, rootDir, request.methodName);
    const isAsync = behavior.returnType.includes("Promise") || behavior.returnType.includes("Task");

    if (readiness.status === "tested") {
      const paramNames = behavior.params.map((p) => p.name);
      const testPayload = this.testDiscovery.extractTestPayload(
        readiness.testFile, rootDir, request.methodName, paramNames
      );
      const typeDefaults = this.buildDefaultPayload(behavior.params);
      return {
        readiness: "tested",
        testFile: readiness.testFile,
        framework: readiness.framework,
        methodLine: behavior.line,
        language: node.language,
        defaultPayload: { ...typeDefaults, ...testPayload },
      };
    }

    return {
      readiness: "untested",
      suggestedTestPath: readiness.suggestedTestPath,
      framework: this.testDiscovery.detectFramework(rootDir, node.file),
      className: request.className,
      methodName: request.methodName,
      language: node.language,
      methodLine: behavior.line,
      isAsync,
      defaultPayload: this.buildDefaultPayload(behavior.params),
    };
  }

  private buildDefaultPayload(params: readonly Parameter[]): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const param of params) {
      payload[param.name] = this.defaultForType(param.type);
    }
    return payload;
  }

  private defaultForType(type: string): unknown {
    const lower = type.toLowerCase().replace(/\s/g, "");
    if (lower === "string") return "sample";
    if (["number", "int", "float", "double", "decimal", "long"].includes(lower)) return 0;
    if (lower === "boolean" || lower === "bool") return false;
    if (lower.endsWith("[]") || lower.startsWith("array") || lower.startsWith("list")) return [];
    if (["record", "map", "object", "dictionary"].some((k) => lower.includes(k))) return {};
    return null;
  }
}
