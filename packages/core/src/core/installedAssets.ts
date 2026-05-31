import * as path from "path";
import type { AnalyzerAssets } from "./types";

// Resolves the analyzer's wasm assets from the installed node_modules. Used by the CLI and
// the tests, which run with node_modules present. The bundled VS Code extension does NOT
// use this — it ships the .wasm files and points the analyzer at its own directory — which
// is why this require.resolve lives here, off the bundled import path, never in core/index.
export function resolveInstalledAssets(): AnalyzerAssets {
  return {
    wasmDirectory: path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out"),
    runtimeWasm: require.resolve("web-tree-sitter/tree-sitter.wasm"),
  };
}
