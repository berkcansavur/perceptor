import * as fs from "fs";
import * as path from "path";
import type { Graph } from "../core";
import { RepoSession } from "./repoSession";
import { TaskStore } from "./taskStore";
import { AutoProcessor } from "./autoProcessor";
import { Scaffolder } from "./scaffolder";
import { DirectoryBrowser } from "./directoryBrowser";
import type { AutoStatus, EnqueuePayload, Task, UpdatePayload } from "./types";

interface CreatePayload {
  kind?: "file" | "folder";
  dir?: string;
  name?: string;
  template?: string;
  typeName?: string;
}

interface Result {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// Transport-agnostic application service: all the work the UI needs, with no
// knowledge of HTTP or postMessage. The CLI and the VS Code extension both drive
// it (the extension over a webview message channel, no server/port).
export class CoreService {
  private readonly session: RepoSession;
  private readonly tasks: TaskStore;
  private readonly autoProcessor: AutoProcessor;
  private readonly scaffolder = new Scaffolder();
  private readonly browser = new DirectoryBrowser();

  constructor(rootDirectory: string, onGraphChange?: () => void) {
    this.session = new RepoSession(rootDirectory, onGraphChange);
    this.tasks = new TaskStore(() => this.session.currentRoot);
    this.autoProcessor = new AutoProcessor(() => this.session.currentRoot, this.tasks);
  }

  async init(): Promise<void> {
    await this.session.reanalyze();
  }

  meta(): { root: string; hostRoot: string; version: number } {
    return { root: this.session.currentRoot, hostRoot: this.session.currentRoot, version: this.session.graphVersion };
  }

  graph(): Graph | null {
    return this.session.graph();
  }

  async reanalyze(): Promise<Result> {
    const graph = await this.session.reanalyze();
    return { ok: true, root: this.session.currentRoot, stats: graph.stats };
  }

  async open(targetPath: string): Promise<Result> {
    const resolved = path.resolve(targetPath.replace(/^~(?=$|\/)/, process.env["HOME"] ?? ""));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return { ok: false, error: "not a directory" };
    }
    const graph = await this.session.open(resolved);
    return { ok: true, root: resolved, hostRoot: resolved, stats: graph.stats };
  }

  fileTemplates(): Result {
    return {
      ok: true,
      extensionFamily: this.scaffolder.extensionFamily,
      familyTemplates: this.scaffolder.familyTemplates,
    };
  }

  source(file: string, from: number, to: number): Result {
    const root = this.session.currentRoot;
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(path.resolve(root))) {
      return { ok: false, error: "out of repo" };
    }
    try {
      const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/);
      return { ok: true, code: lines.slice(Math.max(0, from - 1), to).join("\n") };
    } catch {
      return { ok: false, error: "not found" };
    }
  }

  browse(targetPath: string | null): Result {
    return { ok: true, ...this.browser.list(targetPath) };
  }

  autoStatus(): AutoStatus & { ok: boolean } {
    return { ok: true, ...this.autoProcessor.status() };
  }

  setAuto(enabled: boolean): AutoStatus & { ok: boolean } {
    return { ok: true, ...this.autoProcessor.setEnabled(enabled) };
  }

  listTasks(): { ok: boolean; tasks: Task[] } {
    return { ok: true, tasks: this.tasks.read() };
  }

  enqueueTask(payload: EnqueuePayload): { ok: boolean; task: Task } {
    return { ok: true, task: this.tasks.enqueue(payload) };
  }

  updateTask(payload: UpdatePayload): Result {
    const task = this.tasks.update(payload);
    return task ? { ok: true, task } : { ok: false, error: "task not found" };
  }

  deleteTask(id: string): Result {
    this.tasks.delete(id);
    return { ok: true };
  }

  async create(payload: CreatePayload): Promise<Result> {
    const directory = (payload.dir ?? "").replace(/^\/+/, "");
    const name = (payload.name ?? "").trim();
    if (!name || name.includes("/") || name.includes("..")) {
      return { ok: false, error: "invalid name" };
    }
    const repoRoot = path.resolve(this.session.currentRoot);
    const absoluteDir = path.resolve(repoRoot, directory);
    const targetPath = path.join(absoluteDir, name);
    if (absoluteDir !== repoRoot && !absoluteDir.startsWith(repoRoot + path.sep)) {
      return { ok: false, error: "out of repo" };
    }
    try {
      if (payload.kind === "folder") {
        fs.mkdirSync(targetPath, { recursive: true });
      } else {
        if (fs.existsSync(targetPath)) {
          return { ok: false, error: "file exists" };
        }
        fs.mkdirSync(absoluteDir, { recursive: true });
        const content = this.scaffolder.generate({
          fileName: name,
          template: payload.template ?? "empty",
          typeName: payload.typeName ?? "",
          dir: directory,
          absoluteDir,
        });
        fs.writeFileSync(targetPath, content);
      }
    } catch (error) {
      return { ok: false, error: String(error) };
    }
    const graph = await this.session.reanalyze();
    return { ok: true, stats: graph.stats };
  }

  // RPC entry point for the webview message channel.
  async dispatch(action: string, payload: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case "meta":
        return this.meta();
      case "graph":
        return this.graph();
      case "reanalyze":
        return this.reanalyze();
      case "open":
        return this.open(String(payload["path"] ?? ""));
      case "fileTemplates":
        return this.fileTemplates();
      case "source":
        return this.source(
          String(payload["file"] ?? ""),
          Number(payload["from"] ?? 1),
          Number(payload["to"] ?? 1)
        );
      case "browse":
        return this.browse((payload["path"] as string | null) ?? null);
      case "autoStatus":
        return this.autoStatus();
      case "setAuto":
        return this.setAuto(Boolean(payload["enabled"]));
      case "tasks":
        return this.listTasks();
      case "enqueueTask":
        return this.enqueueTask(payload as EnqueuePayload);
      case "updateTask":
        return this.updateTask(payload as unknown as UpdatePayload);
      case "deleteTask":
        return this.deleteTask(String(payload["id"] ?? ""));
      case "create":
        return this.create(payload as CreatePayload);
      default:
        return { ok: false, error: `unknown action: ${action}` };
    }
  }
}
