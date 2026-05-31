import * as fs from "fs";
import * as path from "path";
import { TreeSitterParser } from "./TreeSitterParser";
import { LanguageRegistry } from "./LanguageRegistry";
import { FileWalker } from "./FileWalker";
import { EdgeBuilder } from "./EdgeBuilder";
import { FileNodeRegistry } from "./FileNodeRegistry";
import { GraphBuilder } from "./GraphBuilder";
import { Graph } from "./types";

export * from "./types";
export { GraphBuilder } from "./GraphBuilder";
export { LanguageRegistry } from "./LanguageRegistry";

function createGraphBuilder(): GraphBuilder {
  const registry = new LanguageRegistry();
  return new GraphBuilder(
    new TreeSitterParser(),
    registry,
    new FileWalker(registry),
    new EdgeBuilder(),
    new FileNodeRegistry()
  );
}

export async function analyze(rootDirectory: string): Promise<Graph> {
  return createGraphBuilder().analyze(rootDirectory);
}

export function outputPath(rootDirectory: string): string {
  return path.join(rootDirectory, ".visualise", "graph.json");
}

export async function analyzeToFile(
  rootDirectory: string
): Promise<{ graph: Graph; outputPath: string }> {
  const graph = await analyze(rootDirectory);
  const target = outputPath(rootDirectory);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(graph, null, 2));
  return { graph, outputPath: target };
}
