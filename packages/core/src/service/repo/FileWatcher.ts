import * as fs from "fs";
import * as path from "path";

// Watches a repo (recursively, debounced) and fires onChange for relevant edits.
// Ignores node_modules/.git/.visualise so our own graph writes don't loop.
export class FileWatcher {
  private watcher: fs.FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly onChange: () => void,
    private readonly debounceMs: number = 600
  ) {}

  watch(rootDirectory: string): void {
    this.close();
    try {
      this.watcher = fs.watch(rootDirectory, { recursive: true }, (_event, filename) => {
        if (this.shouldIgnore(filename)) {
          return;
        }
        if (this.timer) {
          clearTimeout(this.timer);
        }
        this.timer = setTimeout(this.onChange, this.debounceMs);
      });
    } catch {
      /* recursive watch unsupported on this platform — manual refresh still works */
    }
  }

  private shouldIgnore(filename: string | Buffer | null): boolean {
    const name = filename ? filename.toString() : "";
    return (
      name.includes("node_modules") ||
      name.includes(`.git${path.sep}`) ||
      name.includes(".git/") ||
      name.includes(".visualise")
    );
  }

  close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
