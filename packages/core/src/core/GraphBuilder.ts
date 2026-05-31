import * as fs from "fs";
import * as path from "path";
import { TreeSitterParser } from "./TreeSitterParser";
import { LanguageRegistry } from "./LanguageRegistry";
import { FileWalker } from "./FileWalker";
import { EdgeBuilder } from "./EdgeBuilder";
import { FileNodeRegistry } from "./FileNodeRegistry";
import { Behavior, ClassNode, LanguageDefinition, ParsedClass, Graph } from "./types";

type ParsedCode = {
  classes: readonly ParsedClass[];
  moduleBehaviors: readonly Behavior[];
}

// Orchestrates a full analysis. Collaborators are injected (Dependency
// Inversion) so each can be swapped/tested in isolation. Every file becomes at
// least one node: classes for code, a module node for class-less code, and a
// config/file node for everything else.
export class GraphBuilder {
  constructor(
    private readonly parser: TreeSitterParser,
    private readonly registry: LanguageRegistry,
    private readonly walker: FileWalker,
    private readonly edgeBuilder: EdgeBuilder,
    private readonly fileRegistry: FileNodeRegistry
  ) {}

  async analyze(rootDirectory: string): Promise<Graph> {
    const files = this.walker.collectFiles(rootDirectory);
    const nodes: ClassNode[] = [];
    const byLanguage: Record<string, number> = {};

    for (const filePath of files) {
      const sourceCode = this.readFile(filePath);
      if (sourceCode === null) {
        continue;
      }
      const relativeFile = path.relative(rootDirectory, filePath).split(path.sep).join("/");
      const language = this.registry.forFile(filePath);
      const parsedCode = language ? await this.parseCode(language, relativeFile, sourceCode) : null;
      if (language && parsedCode) {
        nodes.push(...this.codeNodes(language, relativeFile, parsedCode));
        byLanguage[language.id] = (byLanguage[language.id] ?? 0) + 1;
      } else {
        nodes.push(this.fileNode(relativeFile, sourceCode));
      }
    }

    const edges = this.edgeBuilder.build(nodes);
    return {
      generatedAt: new Date().toISOString(),
      root: rootDirectory,
      stats: { files: files.length, classes: nodes.length, edges: edges.length, byLanguage },
      nodes,
      edges,
      directories: this.walker.collectDirectories(rootDirectory),
    };
  }

  private async parseCode(
    language: LanguageDefinition,
    relativeFile: string,
    sourceCode: string
  ): Promise<ParsedCode | null> {
    let rootNode;
    try {
      rootNode = await this.parser.parse(language.id, language.wasmPath, sourceCode);
    } catch {
      return null;
    }
    const classes = language.extractor.extract(rootNode, relativeFile);
    const moduleBehaviors =
      classes.length === 0 && language.extractor.topLevelBehaviors
        ? language.extractor.topLevelBehaviors(rootNode, relativeFile)
        : [];
    return { classes, moduleBehaviors };
  }

  // A code file's classes, or — when it declares none — a single module node
  // carrying its top-level functions, so the file still appears in the map.
  private codeNodes(language: LanguageDefinition, relativeFile: string, parsedCode: ParsedCode): ClassNode[] {
    const parsedClasses =
      parsedCode.classes.length > 0 ? parsedCode.classes : [this.moduleClass(relativeFile, parsedCode.moduleBehaviors)];
    return parsedClasses.map((parsedClass) => this.toNode(parsedClass, language.id, relativeFile));
  }

  private moduleClass(relativeFile: string, behaviors: readonly Behavior[]): ParsedClass {
    const fileName = this.baseName(relativeFile);
    return { name: fileName.replace(/\.[^.]+$/, ""), kind: "module", file: relativeFile, line: 1, dependencies: [], behaviors };
  }

  private fileNode(relativeFile: string, content: string): ClassNode {
    const fileName = this.baseName(relativeFile);
    const parsedClass = this.fileRegistry.forFileName(fileName).extract(fileName, content, relativeFile)[0]!;
    return this.toNode(parsedClass, "file", relativeFile);
  }

  // Explicit field order keeps graph.json stable and diff-friendly across runs.
  private toNode(parsedClass: ParsedClass, language: string, relativeFile: string): ClassNode {
    const directory = relativeFile.includes("/") ? relativeFile.slice(0, relativeFile.lastIndexOf("/")) : ".";
    const folder = directory === "." ? "(root)" : directory.slice(directory.lastIndexOf("/") + 1);
    return {
      id: `${relativeFile}::${parsedClass.name}`,
      name: parsedClass.name,
      kind: parsedClass.kind,
      language,
      file: parsedClass.file,
      dir: directory,
      folder,
      line: parsedClass.line,
      behaviors: parsedClass.behaviors,
      dependencies: parsedClass.dependencies,
    };
  }

  private baseName(relativeFile: string): string {
    return relativeFile.includes("/") ? relativeFile.slice(relativeFile.lastIndexOf("/") + 1) : relativeFile;
  }

  private readFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  }
}
