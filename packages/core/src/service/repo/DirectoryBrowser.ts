import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const HIDDEN_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "bin",
  "obj",
  ".git",
]);

export type BrowseEntry = {
  readonly name: string;
  readonly path: string;
}

export type BrowseResult = {
  readonly path: string;
  readonly parent: string | null;
  readonly root: string;
  readonly entries: readonly BrowseEntry[];
}

// Lets the "Open repo" dialog walk local folders, clamped to a safe root.
export class DirectoryBrowser {
  private browseRoot(): string {
    const containerWorkspace = process.env["CONTAINER_WORKSPACE"] ?? "/workspace";
    try {
      if (fs.statSync(containerWorkspace).isDirectory()) {
        return containerWorkspace;
      }
    } catch {
      /* not in a container */
    }
    return os.homedir();
  }

  list(targetPath: string | null): BrowseResult {
    const root = this.browseRoot();
    let resolved = targetPath ? path.resolve(targetPath) : root;
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      resolved = root;
    }

    let entries: BrowseEntry[] = [];
    try {
      entries = fs
        .readdirSync(resolved, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() && !entry.name.startsWith(".") && !HIDDEN_DIRECTORIES.has(entry.name)
        )
        .map((entry) => ({ name: entry.name, path: path.join(resolved, entry.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      /* unreadable dir */
    }

    return {
      path: resolved,
      parent: resolved === root ? null : path.dirname(resolved),
      root,
      entries,
    };
  }
}
