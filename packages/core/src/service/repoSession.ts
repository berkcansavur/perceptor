import { analyze, Graph } from "../core";
import { FileWatcher } from "./fileWatcher";

// Holds the mutable "which repo are we viewing" state: current root, the last
// analyzed graph (in memory), a version (bumped on every analyze) and a file
// watcher that re-analyzes on edits.
export class RepoSession {
  private root: string;
  private version = 0;
  private lastGraph: Graph | null = null;
  private readonly watcher: FileWatcher;

  constructor(initialRoot: string, private readonly onChange?: () => void) {
    this.root = initialRoot;
    this.watcher = new FileWatcher(() => {
      void this.reanalyzeSilently();
    });
    this.watcher.watch(this.root);
  }

  get currentRoot(): string {
    return this.root;
  }

  get graphVersion(): number {
    return this.version;
  }

  graph(): Graph | null {
    return this.lastGraph;
  }

  async reanalyze(): Promise<Graph> {
    this.lastGraph = await analyze(this.root);
    this.version += 1;
    return this.lastGraph;
  }

  async open(rootDirectory: string): Promise<Graph> {
    this.root = rootDirectory;
    this.watcher.watch(this.root);
    return this.reanalyze();
  }

  private async reanalyzeSilently(): Promise<void> {
    try {
      this.lastGraph = await analyze(this.root);
      this.version += 1;
      if (this.onChange) {
        this.onChange();
      }
    } catch {
      /* transient (file mid-write) — next event retries */
    }
  }
}
