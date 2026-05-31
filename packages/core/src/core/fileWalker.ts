import * as fs from "fs";
import * as path from "path";
import { LanguageRegistry } from "./LanguageRegistry";

const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
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
        if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) {
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
