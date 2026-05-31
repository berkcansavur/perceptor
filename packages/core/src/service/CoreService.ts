import * as fs from "fs";
import * as path from "path";
import type { Graph } from "../core";
import { RepoSession } from "./repo/RepoSession";
import { TaskStore } from "./task/TaskStore";
import { AutoProcessor } from "./processing/AutoProcessor";
import { CodingPreferencesStore } from "./persistence/CodingPreferencesStore";
import { BehaviorSummaryStore } from "./persistence/BehaviorSummaryStore";
import { LocaleStore } from "./persistence/LocaleStore";
import { GitInspector } from "./repo/GitInspector";
import { Scaffolder } from "./repo/Scaffolder";
import { DirectoryBrowser } from "./repo/DirectoryBrowser";
import { randomUUID } from "crypto";
import type {
  AutoActivity,
  AutoStatus,
  BehaviorSummary,
  CodingPreferences,
  EnqueuePayload,
  FileOpener,
  Task,
  UpdatePayload,
} from "./types";
import { ExceptionFunnel, successResponse, type ApiResponse } from "./api";
import {
  FileExistsException,
  InvalidNameException,
  NotADirectoryException,
  OutOfRepoException,
  RequestNotFoundException,
  SourceNotFoundException,
  TaskNotFoundException,
  UnsupportedActionException,
} from "./exception";
import {
  AutoActivityCommand,
  AutoStatusCommand,
  BehaviorSummaryCommand,
  BrowseCommand,
  CommandRegistry,
  CreateCommand,
  DeleteTaskCommand,
  EnqueueTaskCommand,
  FileTemplatesCommand,
  GetPreferencesCommand,
  GraphCommand,
  ListTasksCommand,
  MetaCommand,
  OpenCommand,
  ReanalyzeCommand,
  SavePreferencesCommand,
  SetAutoCommand,
  StopProcessingCommand,
  SetLocaleCommand,
  GitStatusCommand,
  SourceCommand,
  UpdateTaskCommand,
  EditRequestCommand,
  OpenFileCommand,
} from "./commands";

export type CreatePayload = {
  kind: "file" | "folder" | null;
  dir: string | null;
  name: string | null;
  template: string | null;
  typeName: string | null;
}

// Transport-agnostic application service: all the work the UI needs, with no
// knowledge of HTTP or postMessage. The CLI and the VS Code extension both drive
// it (the extension over a webview message channel, no server/port).
export class CoreService {
  private readonly session: RepoSession;
  private readonly tasks: TaskStore;
  private readonly autoProcessor: AutoProcessor;
  private readonly preferences: CodingPreferencesStore;
  private readonly behaviorSummaries: BehaviorSummaryStore;
  private readonly locale: LocaleStore;
  private readonly scaffolder = new Scaffolder();
  private readonly browser = new DirectoryBrowser();
  private readonly git = new GitInspector();
  private readonly commands: CommandRegistry;
  private readonly funnel = new ExceptionFunnel();

  constructor(
    rootDirectory: string,
    onGraphChange: (() => void) | null,
    private readonly fileOpener: FileOpener | null = null
  ) {
    this.session = new RepoSession(rootDirectory, onGraphChange);
    this.tasks = new TaskStore(() => this.session.currentRoot);
    this.autoProcessor = new AutoProcessor(() => this.session.currentRoot, this.tasks);
    this.preferences = new CodingPreferencesStore(() => this.session.currentRoot);
    this.behaviorSummaries = new BehaviorSummaryStore(() => this.session.currentRoot);
    this.locale = new LocaleStore(() => this.session.currentRoot);
    this.commands = new CommandRegistry([
      new OpenFileCommand(this),
      new MetaCommand(this),
      new GraphCommand(this),
      new ReanalyzeCommand(this),
      new OpenCommand(this),
      new FileTemplatesCommand(this),
      new SourceCommand(this),
      new BrowseCommand(this),
      new AutoStatusCommand(this),
      new AutoActivityCommand(this),
      new SetAutoCommand(this),
      new StopProcessingCommand(this),
      new SetLocaleCommand(this),
      new GitStatusCommand(this),
      new ListTasksCommand(this),
      new EnqueueTaskCommand(this),
      new UpdateTaskCommand(this),
      new EditRequestCommand(this),
      new DeleteTaskCommand(this),
      new CreateCommand(this),
      new GetPreferencesCommand(this),
      new SavePreferencesCommand(this),
      new BehaviorSummaryCommand(this),
    ]);
  }

  async init(): Promise<void> {
    await this.session.reanalyze();
  }

  meta(): { root: string; hostRoot: string; version: number; locale: string } {
    return {
      root: this.session.currentRoot,
      hostRoot: this.session.currentRoot,
      version: this.session.graphVersion,
      locale: this.locale.read(),
    };
  }

  graph(): Graph | null {
    return this.session.graph();
  }

  // Each method returns its own raw payload (no envelope, no `ok`) and THROWS a
  // DomainException on a business failure. The envelope + error mapping happen once,
  // at the dispatch boundary (see `dispatch` → ExceptionFunnel).

  async reanalyze(): Promise<{ root: string; stats: Graph["stats"] }> {
    const graph = await this.session.reanalyze();
    return { root: this.session.currentRoot, stats: graph.stats };
  }

  async open(targetPath: string): Promise<{ root: string; hostRoot: string; stats: Graph["stats"] }> {
    const resolved = path.resolve(targetPath.replace(/^~(?=$|\/)/, process.env["HOME"] ?? ""));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new NotADirectoryException(targetPath);
    }
    const graph = await this.session.open(resolved);
    return { root: resolved, hostRoot: resolved, stats: graph.stats };
  }

  fileTemplates(): Pick<Scaffolder, "extensionFamily" | "familyTemplates"> {
    return {
      extensionFamily: this.scaffolder.extensionFamily,
      familyTemplates: this.scaffolder.familyTemplates,
    };
  }

  source(file: string, from: number, to: number): { code: string } {
    const root = this.session.currentRoot;
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(path.resolve(root))) {
      throw new OutOfRepoException(file);
    }
    try {
      const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/);
      return { code: lines.slice(Math.max(0, from - 1), to).join("\n") };
    } catch {
      throw new SourceNotFoundException(file);
    }
  }

  browse(targetPath: string | null): ReturnType<DirectoryBrowser["list"]> {
    return this.browser.list(targetPath);
  }

  // Resolve a repo-relative file to its absolute path and hand it to the host's editor.
  // A host that wired no opener (CLI/web) reports the action as unsupported.
  async openFile(file: string, line: number): Promise<{ file: string }> {
    if (!this.fileOpener) {
      throw new UnsupportedActionException("openFile");
    }
    await this.fileOpener.open(path.join(this.session.currentRoot, file), Math.max(0, line - 1));
    return { file };
  }

  autoStatus(): AutoStatus {
    return this.autoProcessor.status();
  }

  setAuto(enabled: boolean): AutoStatus {
    return this.autoProcessor.setEnabled(enabled);
  }

  stopProcessing(taskId: string | null): AutoStatus {
    const stopped = this.locale.read() === "tr" ? "⏹ Kullanıcı durdurdu." : "⏹ Stopped by user.";
    return this.autoProcessor.stop(stopped, taskId);
  }

  setLocale(locale: string): { locale: string } {
    return { locale: this.locale.save(locale) };
  }

  gitStatus(): ReturnType<GitInspector["status"]> {
    return this.git.status(this.session.currentRoot);
  }

  autoActivity(): { activities: AutoActivity[] } {
    return { activities: this.autoProcessor.currentActivities() };
  }

  behaviorSummary(file: string, behavior: string): { summary: BehaviorSummary | null } {
    return { summary: this.behaviorSummaries.read(file, behavior) };
  }

  listTasks(): { tasks: Task[] } {
    return { tasks: this.tasks.read() };
  }

  enqueueTask(payload: EnqueuePayload): { task: Task } {
    const task = this.tasks.enqueue(payload);
    this.autoProcessor.notify();
    return { task };
  }

  updateTask(payload: UpdatePayload): { task: Task } {
    const task = this.tasks.update(payload);
    if (!task) {
      throw new TaskNotFoundException(payload.id);
    }
    this.autoProcessor.notify();
    return { task };
  }

  editRequest(id: string, description: string): { task: Task } {
    const task = this.tasks.editRequest(id, description);
    if (!task) {
      throw new RequestNotFoundException(id);
    }
    this.autoProcessor.notify();
    return { task };
  }

  deleteTask(id: string): { id: string } {
    this.tasks.delete(id);
    return { id };
  }

  getPreferences(): { preferences: CodingPreferences } {
    return { preferences: this.preferences.read() };
  }

  savePreferences(payload: Partial<CodingPreferences>): { preferences: CodingPreferences } {
    return { preferences: this.preferences.save(payload) };
  }

  async create(payload: CreatePayload): Promise<{ stats: Graph["stats"] }> {
    const directory = (payload.dir ?? "").replace(/^\/+/, "");
    const name = (payload.name ?? "").trim();
    if (!name || name.includes("/") || name.includes("..")) {
      throw new InvalidNameException(name);
    }
    const repoRoot = path.resolve(this.session.currentRoot);
    const absoluteDir = path.resolve(repoRoot, directory);
    const targetPath = path.join(absoluteDir, name);
    if (absoluteDir !== repoRoot && !absoluteDir.startsWith(repoRoot + path.sep)) {
      throw new OutOfRepoException(directory);
    }
    // An unexpected fs error (permissions, IO) is not a domain failure — let it bubble
    // to the funnel's INTERNAL_ERROR rather than masking it as a create failure.
    if (payload.kind === "folder") {
      fs.mkdirSync(targetPath, { recursive: true });
    } else {
      if (fs.existsSync(targetPath)) {
        throw new FileExistsException(targetPath);
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
    const graph = await this.session.reanalyze();
    return { stats: graph.stats };
  }

  // RPC entry point for the webview message channel: routes the action polymorphically
  // (no switch), wraps the handler's raw payload in a SuccessResponse, and funnels any
  // thrown DomainException/unexpected error into an ErrorResponse. The single place the
  // envelope is built — every transport (webview, future HTTP/CLI) gets the same shape.
  async dispatch(action: string, payload: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const traceId = randomUUID();
    try {
      const data = await this.commands.dispatch(action, payload);
      return successResponse(data, traceId);
    } catch (error) {
      return this.funnel.toErrorResponse(error, traceId);
    }
  }
}
