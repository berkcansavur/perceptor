import * as fs from "fs";
import * as path from "path";
import { BehaviorSummary } from "../types";

// Caches Claude's one-line method summaries (.visualise/behavior-summaries.json),
// keyed by file + method. The host is the only writer (Claude reports a summary via
// its result file and the host merges it here), so parallel describe-behavior runs
// never race on this file.
export class BehaviorSummaryStore {
  constructor(private readonly rootProvider: () => string) {}

  private file(): string {
    return path.join(this.rootProvider(), ".visualise", "behavior-summaries.json");
  }

  private key(file: string, behavior: string): string {
    return `${file}#${behavior}`;
  }

  private readAll(): Record<string, BehaviorSummary> {
    const file = this.file();
    if (!fs.existsSync(file)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, BehaviorSummary>;
    } catch {
      return {};
    }
  }

  read(file: string, behavior: string): BehaviorSummary | null {
    return this.readAll()[this.key(file, behavior)] ?? null;
  }

  write(file: string, behavior: string, text: string): void {
    const all = this.readAll();
    all[this.key(file, behavior)] = { text, at: new Date().toISOString() };
    const target = this.file();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
    fs.renameSync(tmp, target);
  }
}
