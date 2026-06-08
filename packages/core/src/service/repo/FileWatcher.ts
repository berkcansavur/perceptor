import * as fs from "fs";
import { pathIsIgnored } from "../../core";

// Watches a repo (recursively, debounced) and fires onChange for relevant edits. It shares
// the analyzer's ignore policy (node_modules, build output, dot-dirs, .perceptor, …) so it
// only re-analyzes on changes that can actually alter the graph — otherwise routine churn
// in dist/ or .next/ would loop the UI through endless reload/refresh cycles.
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
    // No name means we can't tell what changed — re-analyze to stay correct.
    if (!filename) {
      return false;
    }
    return pathIsIgnored(filename.toString());
  }

  close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
