import * as fs from "fs";
import * as path from "path";
import { TreeSitterParser } from "./treeSitter";
import { LanguageRegistry } from "./languageRegistry";
import { FileWalker } from "./fileWalker";
import { EdgeBuilder } from "./edgeBuilder";
import { ClassNode, Graph } from "./types";

// Orchestrates a full analysis. Collaborators are injected (Dependency
// Inversion) so each can be swapped/tested in isolation.
export class GraphBuilder {
  constructor(
    private readonly parser: TreeSitterParser,
    private readonly registry: LanguageRegistry,
    private readonly walker: FileWalker,
    private readonly edgeBuilder: EdgeBuilder
  ) {}

  async analyze(rootDirectory: string): Promise<Graph> {
    const sourceFiles = this.walker.collectSourceFiles(rootDirectory);
    const nodes: ClassNode[] = [];
    const byLanguage: Record<string, number> = {};

    for (const filePath of sourceFiles) {
      const language = this.registry.forFile(filePath);
      if (!language) {
        continue;
      }
      const sourceCode = this.readFile(filePath);
      if (sourceCode === null) {
        continue;
      }

      let rootNode;
      try {
        rootNode = await this.parser.parse(language.id, language.wasmPath, sourceCode);
      } catch {
        continue;
      }
      const relativeFile = path.relative(rootDirectory, filePath).split(path.sep).join("/");
      const directory = relativeFile.includes("/")
        ? relativeFile.slice(0, relativeFile.lastIndexOf("/"))
        : ".";
      const folder = directory === "." ? "(root)" : directory.slice(directory.lastIndexOf("/") + 1);

      for (const parsed of language.extractor.extract(rootNode, relativeFile)) {
        // Explicit field order to keep graph.json byte-identical to the legacy output.
        nodes.push({
          id: `${relativeFile}::${parsed.name}`,
          name: parsed.name,
          kind: parsed.kind,
          language: language.id,
          file: parsed.file,
          dir: directory,
          folder,
          line: parsed.line,
          behaviors: parsed.behaviors,
          dependencies: parsed.dependencies,
        });
      }
      byLanguage[language.id] = (byLanguage[language.id] ?? 0) + 1;
    }

    const edges = this.edgeBuilder.build(nodes);
    return {
      generatedAt: new Date().toISOString(),
      root: rootDirectory,
      stats: { files: sourceFiles.length, classes: nodes.length, edges: edges.length, byLanguage },
      nodes,
      edges,
      directories: this.walker.collectDirectories(rootDirectory),
    };
  }

  private readFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  }
}
