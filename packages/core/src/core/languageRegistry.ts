import * as path from "path";
import { LanguageDefinition, LanguageExtractor } from "./types";
import { JavaExtractor } from "./extractors/javaExtractor";
import { CSharpExtractor } from "./extractors/csharpExtractor";
import { TypeScriptExtractor } from "./extractors/typeScriptExtractor";

const WASM_DIRECTORY = path.join(require.resolve("tree-sitter-wasms/package.json"), "..", "out");

// Registry of supported languages. Add a language by registering a definition
// here (Open/Closed) — nothing else in the core changes.
export class LanguageRegistry {
  private readonly byExtension = new Map<string, LanguageDefinition>();

  constructor() {
    const typeScript = new TypeScriptExtractor();
    const definitions: readonly LanguageDefinition[] = [
      this.define("java", [".java"], "tree-sitter-java.wasm", new JavaExtractor()),
      this.define("csharp", [".cs"], "tree-sitter-c_sharp.wasm", new CSharpExtractor()),
      this.define("typescript", [".ts", ".mts", ".cts"], "tree-sitter-typescript.wasm", typeScript),
      this.define("tsx", [".tsx"], "tree-sitter-tsx.wasm", typeScript),
    ];
    for (const definition of definitions) {
      for (const extension of definition.extensions) {
        this.byExtension.set(extension, definition);
      }
    }
  }

  private define(
    id: string,
    extensions: readonly string[],
    wasmFile: string,
    extractor: LanguageExtractor
  ): LanguageDefinition {
    return { id, extensions, wasmPath: path.join(WASM_DIRECTORY, wasmFile), extractor };
  }

  forFile(filePath: string): LanguageDefinition | null {
    return this.byExtension.get(path.extname(filePath).toLowerCase()) ?? null;
  }
}
