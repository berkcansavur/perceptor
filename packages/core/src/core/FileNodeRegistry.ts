import { FileNodeExtractor } from "./types";
import { PackageJsonExtractor } from "./extractors/file/PackageJsonExtractor";
import { DockerfileExtractor } from "./extractors/file/DockerfileExtractor";
import { PlainFileExtractor } from "./extractors/file/PlainFileExtractor";

// Ordered strategies for non-code files; the first match wins. PlainFile is the
// catch-all (matches everything), so every file becomes a node. Add a richer
// extractor by inserting it before the fallback (Open/Closed) — nothing else changes.
export class FileNodeRegistry {
  private readonly extractors: readonly FileNodeExtractor[] = [
    new PackageJsonExtractor(),
    new DockerfileExtractor(),
    new PlainFileExtractor(),
  ];

  forFileName(fileName: string): FileNodeExtractor {
    const fallback = this.extractors[this.extractors.length - 1]!;
    return this.extractors.find((extractor) => extractor.matches(fileName)) ?? fallback;
  }
}
