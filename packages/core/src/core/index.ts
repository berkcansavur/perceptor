import * as fs from "fs";
import * as path from "path";
import { TreeSitterParser } from "./treeSitter";
import { LanguageRegistry } from "./languageRegistry";
import { FileWalker } from "./fileWalker";
import { EdgeBuilder } from "./edgeBuilder";
import { GraphBuilder } from "./graphBuilder";
import { Graph } from "./types";

export * from "./types";
export { GraphBuilder } from "./graphBuilder";
export { LanguageRegistry } from "./languageRegistry";

function createGraphBuilder(): GraphBuilder {
  const registry = new LanguageRegistry();
  return new GraphBuilder(new TreeSitterParser(), registry, new FileWalker(registry), new EdgeBuilder());
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
