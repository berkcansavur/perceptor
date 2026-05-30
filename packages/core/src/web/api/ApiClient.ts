import type { AutoStatus, BrowseData, Graph, MetaResponse, Task, TemplateRegistry } from "../types";

interface OkResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

// Talks to the extension host over the webview message channel — no HTTP, no
// port. Each call is an `{ id, action, payload }` request correlated to an
// `{ id, result }` response.
export class ApiClient {
  private sequence = 0;
  private readonly pending = new Map<number, (result: unknown) => void>();

  constructor() {
    window.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as { id?: number; result?: unknown };
      if (typeof data?.id === "number") {
        const resolve = this.pending.get(data.id);
        if (resolve) {
          this.pending.delete(data.id);
          resolve(data.result);
        }
      }
    });
  }

  private call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve) => {
      this.pending.set(id, (result) => resolve(result as T));
      vscode.postMessage({ id, action, payload });
    });
  }

  graph(): Promise<Graph | null> {
    return this.call("graph");
  }

  meta(): Promise<MetaResponse> {
    return this.call("meta");
  }

  fileTemplates(): Promise<TemplateRegistry & OkResponse> {
    return this.call("fileTemplates");
  }

  source(file: string, from: string, to: string): Promise<{ ok: boolean; code?: string }> {
    return this.call("source", { file, from: Number(from), to: Number(to) });
  }

  browse(targetPath: string | null): Promise<BrowseData> {
    return this.call("browse", { path: targetPath });
  }

  open(path: string): Promise<OkResponse & { root?: string; hostRoot?: string }> {
    return this.call("open", { path });
  }

  async tasks(): Promise<Task[]> {
    const result = await this.call<{ tasks?: Task[] }>("tasks");
    return result.tasks ?? [];
  }

  async enqueueTask(payload: Record<string, unknown>): Promise<void> {
    await this.call("enqueueTask", payload);
  }

  async updateTask(id: string, payload: Record<string, unknown>): Promise<void> {
    await this.call("updateTask", { id, ...payload });
  }

  async deleteTask(id: string): Promise<void> {
    await this.call("deleteTask", { id });
  }

  create(payload: Record<string, string>): Promise<OkResponse> {
    return this.call("create", payload);
  }

  autoStatus(): Promise<AutoStatus> {
    return this.call("autoStatus");
  }

  async setAuto(enabled: boolean): Promise<void> {
    await this.call("setAuto", { enabled });
  }

  // Opens a file in the editor (handled by the extension host, not the core).
  async openFile(file: string, line: string): Promise<void> {
    await this.call("openFile", { file, line: Number(line) });
  }
}
