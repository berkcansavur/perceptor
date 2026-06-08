import * as fs from "fs";
import * as path from "path";
import { TreeSitterParser } from "./TreeSitterParser";
import { LanguageRegistry } from "./LanguageRegistry";
import { FileWalker } from "./FileWalker";
import { EdgeBuilder } from "./EdgeBuilder";
import { FileNodeRegistry } from "./FileNodeRegistry";
import { GraphBuilder } from "./GraphBuilder";
import { AnalyzerAssets, Graph } from "./types";
import { ensurePerceptorIgnored, migrateLegacyScratchDir } from "./ensurePerceptorIgnored";

export * from "./types";
export { GraphBuilder } from "./GraphBuilder";
export { LanguageRegistry } from "./LanguageRegistry";
export { ensurePerceptorIgnored, migrateLegacyScratchDir } from "./ensurePerceptorIgnored";
export { IGNORED_DIRECTORIES, isIgnoredSegment, pathIsIgnored } from "./FileWalker";

// Assets are injected (never resolved from node_modules here) so this module carries no
// runtime path assumption — a bundled host passes the location of its shipped .wasm files.
function createGraphBuilder(assets: AnalyzerAssets): GraphBuilder {
  const languageRegistry = new LanguageRegistry(assets.wasmDirectory);
  return new GraphBuilder(
    new TreeSitterParser(assets.runtimeWasm),
    languageRegistry,
    new FileWalker(languageRegistry),
    new EdgeBuilder(),
    new FileNodeRegistry()
  );
}

export async function analyze(rootDirectory: string, assets: AnalyzerAssets): Promise<Graph> {
  // Migrate any pre-rename .visualise scratch dir before stores read it.
  migrateLegacyScratchDir(rootDirectory);
  return createGraphBuilder(assets).analyze(rootDirectory);
}

export function outputPath(rootDirectory: string): string {
  return path.join(rootDirectory, ".perceptor", "graph.json");
}

export async function analyzeToFile(
  rootDirectory: string,
  assets: AnalyzerAssets
): Promise<{ graph: Graph; outputPath: string }> {
  const graph = await analyze(rootDirectory, assets);
  const target = outputPath(rootDirectory);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  ensurePerceptorIgnored(rootDirectory);
  fs.writeFileSync(target, JSON.stringify(graph, null, 2));
  return { graph, outputPath: target };
}
