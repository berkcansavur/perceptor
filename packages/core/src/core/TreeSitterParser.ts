import Parser from "web-tree-sitter";
import { TsNode } from "./types";

// Thin wrapper around web-tree-sitter: lazy init + grammar cache. Returns our
// structural TsNode so the rest of the core never touches the library's types.
export class TreeSitterParser {
  private parser: Parser | null = null;
  private readonly grammars = new Map<string, Parser.Language>();

  // `runtimeWasm` is the absolute path to web-tree-sitter's tree-sitter.wasm; a bundled
  // host ships it and points here, instead of the library guessing a node_modules path.
  constructor(private readonly runtimeWasm: string) {}

  private async ready(): Promise<Parser> {
    if (!this.parser) {
      await Parser.init({ locateFile: () => this.runtimeWasm });
      this.parser = new Parser();
    }
    return this.parser;
  }

  private async grammar(languageId: string, wasmPath: string): Promise<Parser.Language> {
    const cached = this.grammars.get(languageId);
    if (cached) {
      return cached;
    }
    const loaded = await Parser.Language.load(wasmPath);
    this.grammars.set(languageId, loaded);
    return loaded;
  }

  async parse(languageId: string, wasmPath: string, source: string): Promise<TsNode> {
    const parser = await this.ready();
    parser.setLanguage(await this.grammar(languageId, wasmPath));
    return parser.parse(source).rootNode as unknown as TsNode;
  }
}
