import type {
  ApiError,
  ApiRequest,
  ApiResponse,
  AutoActivity,
  AutoStatus,
  BehaviorSummary,
  BrowseData,
  CodingPreferences,
  ComplexityReport,
  CreatePayload,
  EnqueuePayload,
  Graph,
  MetaResponse,
  Task,
  TaskStatus,
  TemplateRegistry,
} from "../types";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

// The RPC result contract: each action name mapped to the data its success payload
// carries. With ApiRequest (the request mirror), this makes `call` typed end to end — the
// action is a key of both maps (no loose string), the payload must be `ApiRequest[action]`,
// and the resolved value is `ApiContract[action]`. The host's CoreService methods return
// exactly these shapes.
type ApiContract = {
  graph: Graph | null;
  meta: MetaResponse;
  reanalyze: { root: string; stats: Graph["stats"] };
  fileTemplates: TemplateRegistry;
  source: { code: string };
  browse: BrowseData;
  open: { root: string; hostRoot: string; stats: Graph["stats"] };
  tasks: { tasks: Task[] };
  enqueueTask: { task: Task };
  updateTask: { task: Task };
  editRequest: { task: Task };
  editMessage: { task: Task };
  deleteTask: { id: string };
  getPreferences: { preferences: CodingPreferences };
  savePreferences: { preferences: CodingPreferences };
  behaviorSummary: { summary: BehaviorSummary | null };
  complexity: { report: ComplexityReport };
  create: { stats: Graph["stats"] };
  autoStatus: AutoStatus;
  autoActivity: { activities: AutoActivity[] };
  setAuto: AutoStatus;
  stopProcessing: AutoStatus;
  setLocale: { locale: string };
  gitStatus: { isRepo: boolean; dirtyFiles: string[]; trackedFiles: string[] };
  openFile: { file: string };
};

// The behavior every consumer depends on — an abstraction over the transport. Components
// take an `Api`, not the concrete client, so they call intent-named methods rather than
// a stringly-typed channel. `ApiClient` is the webview message-channel implementation.
export interface Api {
  graph(): Promise<Graph | null>;
  meta(): Promise<MetaResponse>;
  reanalyze(): Promise<void>;
  fileTemplates(): Promise<TemplateRegistry>;
  source(file: string, from: string, to: string): Promise<string>;
  browse(targetPath: string | null): Promise<BrowseData>;
  open(path: string): Promise<ApiContract["open"]>;
  tasks(): Promise<Task[]>;
  enqueueTask(payload: EnqueuePayload): Promise<void>;
  setTaskStatus(id: string, status: TaskStatus): Promise<void>;
  replyToTask(id: string, message: string): Promise<void>;
  archiveTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  editRequest(id: string, description: string): Promise<void>;
  editMessage(id: string, index: number, text: string): Promise<void>;
  getPreferences(): Promise<CodingPreferences>;
  savePreferences(preferences: CodingPreferences): Promise<void>;
  sendRequest(description: string): Promise<void>;
  behaviorSummary(file: string, behavior: string): Promise<BehaviorSummary | null>;
  complexity(code: string, name: string): Promise<ComplexityReport>;
  describeBehavior(context: {
    className: string;
    file: string;
    behavior: string;
    line: string;
    endLine: string;
  }): Promise<void>;
  create(payload: CreatePayload): Promise<void>;
  autoStatus(): Promise<AutoStatus>;
  autoActivity(): Promise<AutoActivity[]>;
  setAuto(enabled: boolean): Promise<void>;
  stopProcessing(taskId: string | null): Promise<void>;
  setLocale(locale: string): Promise<void>;
  gitStatus(): Promise<ApiContract["gitStatus"]>;
  openFile(file: string, line: string): Promise<void>;
}

// Thrown when the host answers with an ErrorResponse. Carries the machine `code`
// (an ErrorCode name) and `details` so a caller's catch can branch or show a message,
// instead of unwrapping an `ok: boolean` everywhere.
export class ApiCallError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = "ApiCallError";
    this.code = error.code;
    this.details = error.details;
  }
}

// Talks to the extension host over the webview message channel — no HTTP, no port.
// Each call is an `{ id, action, payload }` request correlated to an `{ id, result }`
// response whose `result` is an ApiResponse envelope. `call` unwraps it: resolves with
// `data` on success, rejects with an ApiCallError on failure, so callers work in plain
// values + try/catch. `action` is keyed to ApiContract / ApiRequest, so both the request
// payload and the resolved result are fully typed.
export class ApiClient implements Api {
  private sequence = 0;
  private readonly pending = new Map<number, (response: unknown) => void>();

  constructor() {
    window.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as { id?: number; result?: unknown };
      if (typeof data?.id === "number") {
        const settle = this.pending.get(data.id);
        if (settle) {
          this.pending.delete(data.id);
          settle(data.result);
        }
      }
    });
  }

  private call<Action extends keyof ApiContract>(
    action: Action,
    payload: ApiRequest[Action]
  ): Promise<ApiContract[Action]> {
    const id = ++this.sequence;
    return new Promise<ApiContract[Action]>((resolve, reject) => {
      this.pending.set(id, (response) => {
        const envelope = response as ApiResponse<ApiContract[Action]>;
        if (envelope.success) {
          resolve(envelope.data);
        } else {
          reject(new ApiCallError(envelope.error));
        }
      });
      vscode.postMessage({ id, action, payload });
    });
  }

  graph(): Promise<Graph | null> {
    return this.call("graph", {});
  }

  meta(): Promise<MetaResponse> {
    return this.call("meta", {});
  }

  async reanalyze(): Promise<void> {
    await this.call("reanalyze", {});
  }

  fileTemplates(): Promise<TemplateRegistry> {
    return this.call("fileTemplates", {});
  }

  async source(file: string, from: string, to: string): Promise<string> {
    const { code } = await this.call("source", { file, from: Number(from), to: Number(to) });
    return code;
  }

  browse(targetPath: string | null): Promise<BrowseData> {
    return this.call("browse", { path: targetPath });
  }

  open(path: string): Promise<ApiContract["open"]> {
    return this.call("open", { path });
  }

  async tasks(): Promise<Task[]> {
    const { tasks } = await this.call("tasks", {});
    return tasks;
  }

  async enqueueTask(payload: EnqueuePayload): Promise<void> {
    await this.call("enqueueTask", payload);
  }

  // The three UI update intents, each building the full UpdatePayload (every field
  // present, the untouched ones null) so the request stays a typed value, never a partial bag.
  async setTaskStatus(id: string, status: TaskStatus): Promise<void> {
    await this.call("updateTask", {
      id,
      status,
      message: null,
      diff: null,
      role: null,
      commitMessage: null,
      impact: null,
      dismissed: null,
    });
  }

  async replyToTask(id: string, message: string): Promise<void> {
    await this.call("updateTask", {
      id,
      status: null,
      message,
      diff: null,
      role: "user",
      commitMessage: null,
      impact: null,
      dismissed: null,
    });
  }

  async archiveTask(id: string): Promise<void> {
    await this.call("updateTask", {
      id,
      status: null,
      message: null,
      diff: null,
      role: null,
      commitMessage: null,
      impact: null,
      dismissed: true,
    });
  }

  async deleteTask(id: string): Promise<void> {
    await this.call("deleteTask", { id });
  }

  // Rewrite a chat request's prompt and re-run it cold. The task keeps its id (and
  // its accumulated token usage); the new run adds onto that total.
  async editRequest(id: string, description: string): Promise<void> {
    await this.call("editRequest", { id, description });
  }

  // Edit a message already in the thread and re-run from that point — later turns are
  // dropped on the host. The task keeps its id and accumulated token usage.
  async editMessage(id: string, index: number, text: string): Promise<void> {
    await this.call("editMessage", { id, index, description: text });
  }

  async getPreferences(): Promise<CodingPreferences> {
    const { preferences } = await this.call("getPreferences", {});
    return preferences;
  }

  async savePreferences(preferences: CodingPreferences): Promise<void> {
    await this.call("savePreferences", preferences);
  }

  // Free-form requirement → a `request` task the skill implements; enqueue on the
  // host triggers the event-driven auto-processor.
  async sendRequest(description: string): Promise<void> {
    await this.call("enqueueTask", { type: "request", spec: { description } });
  }

  async behaviorSummary(file: string, behavior: string): Promise<BehaviorSummary | null> {
    const { summary } = await this.call("behaviorSummary", { file, behavior });
    return summary;
  }

  async complexity(code: string, name: string): Promise<ComplexityReport> {
    const { report } = await this.call("complexity", { code, name });
    return report;
  }

  // Asks Claude to summarize a method; the skill writes it to the cache the drawer
  // then reads. A no-diff task, hidden from the queue/changes lists.
  async describeBehavior(context: {
    className: string;
    file: string;
    behavior: string;
    line: string;
    endLine: string;
  }): Promise<void> {
    await this.call("enqueueTask", {
      type: "describe-behavior",
      from: { class: context.className, file: context.file, behavior: context.behavior },
      spec: { line: Number(context.line), endLine: Number(context.endLine) },
    });
  }

  async create(payload: CreatePayload): Promise<void> {
    await this.call("create", payload);
  }

  autoStatus(): Promise<AutoStatus> {
    return this.call("autoStatus", {});
  }

  async autoActivity(): Promise<AutoActivity[]> {
    const { activities } = await this.call("autoActivity", {});
    return activities;
  }

  async setAuto(enabled: boolean): Promise<void> {
    await this.call("setAuto", { enabled });
  }

  // Interrupt a Claude run (stops burning tokens). With a taskId, only that task's
  // run is killed; with null, every in-flight run is.
  async stopProcessing(taskId: string | null): Promise<void> {
    await this.call("stopProcessing", { taskId });
  }

  async setLocale(locale: string): Promise<void> {
    await this.call("setLocale", { locale });
  }

  gitStatus(): Promise<ApiContract["gitStatus"]> {
    return this.call("gitStatus", {});
  }

  // Opens a file in the editor (the core resolves the path; the host's injected
  // FileOpener does the editor work).
  async openFile(file: string, line: string): Promise<void> {
    await this.call("openFile", { file, line: Number(line) });
  }
}
