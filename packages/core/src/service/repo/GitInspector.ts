import { execFileSync } from "child_process";

export type GitStatusResult = {
  isRepo: boolean;
  dirtyFiles: string[];
  trackedFiles: string[];
}

const RENAME_ARROW = " -> ";

// Reads the working tree's git state so the UI can tell committed changes from
// uncommitted ones. A change is "committed" once its file is no longer dirty.
//
// The analysed repo may be a SUBDIRECTORY of the actual git repo (e.g. a stray
// `.git` in $HOME). git reports repo-root-relative paths, so we translate them to
// paths relative to the analysed root via `--show-prefix`, and use `-uall` so an
// entirely-untracked folder lists its files individually instead of collapsing to
// one entry. An untracked file is dirty — i.e. not committed.
export class GitInspector {
  status(root: string): GitStatusResult {
    const toplevel = this.run(root, ["rev-parse", "--show-toplevel"]).trim();
    if (!toplevel) {
      return { isRepo: false, dirtyFiles: [], trackedFiles: [] };
    }
    const prefix = this.run(root, ["rev-parse", "--show-prefix"]).trim();
    return {
      isRepo: true,
      dirtyFiles: this.dirtyFiles(root, prefix),
      trackedFiles: this.trackedFiles(root, prefix),
    };
  }

  // Files git actually tracks under the analysed dir. A change is only "committed"
  // when its file is tracked AND clean — an untracked (or moved-away) file is not.
  private trackedFiles(root: string, prefix: string): string[] {
    const files = new Set<string>();
    for (const line of this.run(root, ["ls-files", "--", "."]).split("\n")) {
      if (line.trim()) {
        const relative = this.toSubtreeRelative(this.unquote(line.trim()), prefix);
        if (relative !== null) {
          files.add(relative);
        }
      }
    }
    return [...files];
  }

  private dirtyFiles(root: string, prefix: string): string[] {
    const files = new Set<string>();
    // `-- .` scopes the scan to the analysed dir — vital when it's a subdirectory of
    // a much larger repo (e.g. a stray `.git` in $HOME), where an unscoped scan would
    // walk the whole tree and blow the output buffer.
    for (const line of this.run(root, ["status", "--porcelain", "-uall", "--", "."]).split("\n")) {
      if (line.trim()) {
        this.collectPaths(line, prefix, files);
      }
    }
    return [...files];
  }

  // A porcelain line is "XY path" or "XY old -> new" (rename) — both sides are dirty.
  // Paths are repo-root-relative; keep only those under the analysed subtree, made
  // relative to it so they match the tasks' file paths.
  private collectPaths(line: string, prefix: string, files: Set<string>): void {
    const rest = line.slice(3);
    const arrow = rest.indexOf(RENAME_ARROW);
    const rawPaths = arrow >= 0 ? [rest.slice(0, arrow), rest.slice(arrow + RENAME_ARROW.length)] : [rest];
    for (const rawPath of rawPaths) {
      const relative = this.toSubtreeRelative(this.unquote(rawPath), prefix);
      if (relative !== null) {
        files.add(relative);
      }
    }
  }

  private toSubtreeRelative(repoPath: string, prefix: string): string | null {
    if (!prefix) {
      return repoPath;
    }
    return repoPath.startsWith(prefix) ? repoPath.slice(prefix.length) : null;
  }

  private unquote(path: string): string {
    return path.trim().replace(/^"(.*)"$/, "$1");
  }

  private run(root: string, args: readonly string[]): string {
    try {
      return execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return "";
    }
  }
}
