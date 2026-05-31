import { randomUUID } from "crypto";
import { RepoSession } from "./repo/RepoSession";
import { WorkspaceService } from "./WorkspaceService";
import { TaskService } from "./TaskService";
import { PreferencesService } from "./PreferencesService";
import { AnalysisService } from "./AnalysisService";
import type { AnalyzerAssets } from "../core";
import type { AutoStatus, FileOpener } from "./types";
import { ExceptionFunnel, successResponse, type ApiResponse } from "./api";
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
  EditMessageCommand,
  ComplexityCommand,
  OpenFileCommand,
} from "./commands";

// Composition root + RPC boundary. It owns no business logic — it wires the shared session
// and the focused application services (workspace / tasks / preferences / analysis), binds
// each command to the service it drives, and funnels every dispatch through one envelope.
// The CLI and the VS Code extension both construct it; the extension also calls `init` and
// `setAuto` directly (outside the RPC channel) at startup.
export class CoreService {
  private readonly workspace: WorkspaceService;
  private readonly tasks: TaskService;
  private readonly preferences: PreferencesService;
  private readonly analysis: AnalysisService;
  private readonly commands: CommandRegistry;
  private readonly funnel = new ExceptionFunnel();

  constructor(
    rootDirectory: string,
    onGraphChange: (() => void) | null,
    fileOpener: FileOpener | null,
    assets: AnalyzerAssets
  ) {
    const session = new RepoSession(rootDirectory, onGraphChange, assets);
    const rootProvider = (): string => session.currentRoot;
    this.preferences = new PreferencesService(rootProvider);
    const localeProvider = (): string => this.preferences.locale();
    this.workspace = new WorkspaceService(session, fileOpener, localeProvider);
    this.tasks = new TaskService(rootProvider, localeProvider);
    this.analysis = new AnalysisService();
    this.commands = new CommandRegistry([
      new MetaCommand(this.workspace),
      new GraphCommand(this.workspace),
      new ReanalyzeCommand(this.workspace),
      new OpenCommand(this.workspace),
      new FileTemplatesCommand(this.workspace),
      new SourceCommand(this.workspace),
      new BrowseCommand(this.workspace),
      new GitStatusCommand(this.workspace),
      new OpenFileCommand(this.workspace),
      new CreateCommand(this.workspace),
      new ListTasksCommand(this.tasks),
      new EnqueueTaskCommand(this.tasks),
      new UpdateTaskCommand(this.tasks),
      new EditRequestCommand(this.tasks),
      new EditMessageCommand(this.tasks),
      new DeleteTaskCommand(this.tasks),
      new AutoStatusCommand(this.tasks),
      new AutoActivityCommand(this.tasks),
      new SetAutoCommand(this.tasks),
      new StopProcessingCommand(this.tasks),
      new GetPreferencesCommand(this.preferences),
      new SavePreferencesCommand(this.preferences),
      new SetLocaleCommand(this.preferences),
      new BehaviorSummaryCommand(this.preferences),
      new ComplexityCommand(this.analysis),
    ]);
  }

  async init(): Promise<void> {
    await this.workspace.init();
  }

  // The extension turns auto-processing on at startup, outside the RPC channel.
  setAuto(enabled: boolean): AutoStatus {
    return this.tasks.setAuto(enabled);
  }

  // RPC entry point for the webview message channel: routes the action polymorphically
  // (no switch), wraps the handler's raw payload in a SuccessResponse, and funnels any
  // thrown DomainException/unexpected error into an ErrorResponse. The single place the
  // envelope is built — every transport (webview, future HTTP/CLI) gets the same shape.
  async dispatch(action: string, payload: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const traceId = randomUUID();
    try {
      const commandResult = await this.commands.dispatch(action, payload);
      return successResponse(commandResult, traceId);
    } catch (error) {
      return this.funnel.toErrorResponse(error, traceId);
    }
  }
}
