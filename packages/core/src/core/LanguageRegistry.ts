import * as path from "path";
import { LanguageDefinition, LanguageExtractor } from "./types";
import { JavaExtractor } from "./extractors/JavaExtractor";
import { CSharpExtractor } from "./extractors/CSharpExtractor";
import { TypeScriptExtractor } from "./extractors/TypeScriptExtractor";
import { GoExtractor } from "./extractors/GoExtractor";

// Registry of supported languages. Add a language by registering a definition
// here (Open/Closed) — nothing else in the core changes. Grammar .wasm files are resolved
// against the injected directory, so a bundled host supplies its own shipped location.
export class LanguageRegistry {
  private readonly byExtension = new Map<string, LanguageDefinition>();

  constructor(private readonly wasmDirectory: string) {
    const typeScript = new TypeScriptExtractor();
    const definitions: readonly LanguageDefinition[] = [
      this.define("java", [".java"], "tree-sitter-java.wasm", new JavaExtractor()),
      this.define("csharp", [".cs"], "tree-sitter-c_sharp.wasm", new CSharpExtractor()),
      this.define("go", [".go"], "tree-sitter-go.wasm", new GoExtractor()),
      this.define("typescript", [".ts", ".mts", ".cts"], "tree-sitter-typescript.wasm", typeScript),
      this.define("tsx", [".tsx"], "tree-sitter-tsx.wasm", typeScript),
    ];
    definitions
      .flatMap((definition) => definition.extensions.map((extension) => ({ extension, definition })))
      .forEach(({ extension, definition }) => this.byExtension.set(extension, definition));
  }

  private define(
    id: string,
    extensions: readonly string[],
    wasmFile: string,
    extractor: LanguageExtractor
  ): LanguageDefinition {
    return { id, extensions, wasmPath: path.join(this.wasmDirectory, wasmFile), extractor };
  }

  forFile(filePath: string): LanguageDefinition | null {
    return this.byExtension.get(path.extname(filePath).toLowerCase()) ?? null;
  }
}
