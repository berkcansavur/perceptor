import * as fs from "fs";
import * as path from "path";
import { Command } from "./Command";
import type { WorkspaceService } from "../WorkspaceService";
import type { TestScaffoldGenerator } from "../../core/TestScaffoldGenerator";
import type { TestDiscovery } from "../../core/TestDiscovery";
import type { ApiRequest, GenerateTestScaffoldResult } from "../types";
import { UnsupportedActionException } from "../exception/UnsupportedActionException";
import { SourceNotFoundException } from "../exception/SourceNotFoundException";

export class GenerateTestScaffoldCommand extends Command<ApiRequest["generateTestScaffold"], GenerateTestScaffoldResult> {
  readonly action = "generateTestScaffold";

  constructor(
    private readonly workspace: WorkspaceService,
    private readonly scaffoldGenerator: TestScaffoldGenerator,
    private readonly testDiscovery: TestDiscovery
  ) {
    super();
  }

  protected parse(payload: Record<string, unknown>): ApiRequest["generateTestScaffold"] {
    return {
      file: this.text(payload, "file"),
      className: this.text(payload, "className"),
      methods: (payload["methods"] as string[]) ?? [],
    };
  }

  protected run(request: ApiRequest["generateTestScaffold"]): GenerateTestScaffoldResult {
    const graph = this.workspace.graph();
    if (!graph) {
      throw new UnsupportedActionException("generateTestScaffold — analyze the repository first");
    }

    const node = graph.nodes.find((n) => n.file === request.file && n.name === request.className);
    if (!node) {
      throw new SourceNotFoundException(`${request.className} in ${request.file}`);
    }

    const rootDir = this.workspace.root();
    const framework = this.testDiscovery.detectFramework(rootDir, node.file);
    const constructorDeps = node.dependencies.filter((d) => d.source === "constructor");
    const testPath = this.testDiscovery.suggestTestPath(node.file, node.language);

    const content = this.scaffoldGenerator.generate({
      className: node.name,
      file: node.file,
      behaviors: node.behaviors,
      constructorDeps,
      framework,
      methodFilter: request.methods,
    });

    const absoluteTestPath = path.join(rootDir, testPath);
    fs.mkdirSync(path.dirname(absoluteTestPath), { recursive: true });
    fs.writeFileSync(absoluteTestPath, content, "utf-8");

    return { testPath, content };
  }
}
