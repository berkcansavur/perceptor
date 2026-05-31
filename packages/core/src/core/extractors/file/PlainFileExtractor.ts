import { FileNodeExtractor, ParsedClass } from "../../types";

// Catch-all: any file with no richer extractor becomes a plain "file" node, so the
// map shows the whole repository (assets, docs, lock files) — not just code.
export class PlainFileExtractor implements FileNodeExtractor {
  matches(): boolean {
    return true;
  }

  extract(fileName: string, _content: string, relativeFile: string): readonly ParsedClass[] {
    return [{ name: fileName, kind: "file", file: relativeFile, line: 1, dependencies: [], behaviors: [] }];
  }
}
