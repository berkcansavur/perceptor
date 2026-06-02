import * as fs from "fs";
import * as path from "path";
import { LanguageRegistry } from "./LanguageRegistry";

// Directories whose contents never affect the graph: dependencies, build output, IDE/
// tooling state, and our own writes. Exported so the file watcher shares the exact same
// policy — otherwise it re-analyzes on churn (e.g. dist/ rebuilds) the walker would skip,
// which loops the UI through endless "refresh" reloads.
export const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".gradle",
  ".idea",
  ".vscode",
  "build",
  "out",
  "dist",
  "bin",
  "obj",
  "target",
  "Library",
  "Temp",
  "Logs",
  "Obj",
  ".visualise",
]);

// A path segment to skip: an explicitly-ignored directory, or any dotfile/dot-directory
// (covers .next, .turbo, .cache, .DS_Store, … without listing each).
export function isIgnoredSegment(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name) || name.startsWith(".");
}

// True when any segment of a relative path lies under an ignored location.
export function pathIsIgnored(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => segment.length > 0 && isIgnoredSegment(segment));
}

export class FileWalker {
  constructor(private readonly registry: LanguageRegistry) {}

  collectSourceFiles(rootDirectory: string): string[] {
    const sourceFiles: string[] = [];
    this.visit(rootDirectory, (fullPath, entry) => {
      if (entry.isFile() && this.registry.forFile(fullPath)) {
        sourceFiles.push(fullPath);
      }
    });
    return sourceFiles;
  }

  // Every non-ignored file (code or not) so the map can show the whole repo.
  collectFiles(rootDirectory: string): string[] {
    const files: string[] = [];
    this.visit(rootDirectory, (fullPath, entry) => {
      if (entry.isFile()) {
        files.push(fullPath);
      }
    });
    return files;
  }

  // All non-ignored directories (relative, "/"-joined) so the folder tree can
  // show folders that contain no code yet.
  collectDirectories(rootDirectory: string): string[] {
    const directories: string[] = [];
    this.visit(rootDirectory, (fullPath, entry) => {
      if (entry.isDirectory()) {
        directories.push(path.relative(rootDirectory, fullPath).split(path.sep).join("/"));
      }
    });
    return directories;
  }

  private visit(directory: string, onEntry: (fullPath: string, entry: fs.Dirent) => void): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isIgnoredSegment(entry.name)) {
          continue;
        }
        const fullPath = path.join(directory, entry.name);
        onEntry(fullPath, entry);
        this.visit(fullPath, onEntry);
      } else {
        onEntry(path.join(directory, entry.name), entry);
      }
    }
  }
}
