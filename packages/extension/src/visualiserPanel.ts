import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { CoreService } from "repo-visualiser/dist/service";

interface RpcMessage {
  id: number;
  action: string;
  payload: Record<string, unknown>;
}

// Hosts the UI in a webview and bridges the webview message channel to the
// CoreService — no HTTP, no localhost. Assets load via asWebviewUri.
export class VisualiserPanel {
  private static current: VisualiserPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly core: CoreService,
    private readonly webDirectory: string,
    private readonly log: (message: string) => void
  ) {
    this.panel = vscode.window.createWebviewPanel("repoVisualiser", "Repo Visualiser", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(this.webDirectory)],
    });
    this.panel.webview.html = this.html(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: RpcMessage) => void this.onMessage(message));
    this.panel.onDidDispose(() => {
      VisualiserPanel.current = undefined;
    });
  }

  static show(core: CoreService, webDirectory: string, log: (message: string) => void): void {
    if (VisualiserPanel.current) {
      VisualiserPanel.current.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    VisualiserPanel.current = new VisualiserPanel(core, webDirectory, log);
  }

  private async onMessage(message: RpcMessage): Promise<void> {
    let result: unknown;
    try {
      result =
        message.action === "openFile"
          ? await this.openFile(message.payload)
          : await this.core.dispatch(message.action, message.payload);
    } catch (error) {
      this.log(`dispatch ${message.action} failed: ${error instanceof Error ? error.message : String(error)}`);
      result = { ok: false, error: "internal error" };
    }
    void this.panel.webview.postMessage({ id: message.id, result });
  }

  private async openFile(payload: Record<string, unknown>): Promise<{ ok: boolean }> {
    const file = String(payload["file"] ?? "");
    const line = Math.max(0, Number(payload["line"] ?? 1) - 1);
    const root = this.core.meta().root;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, file)));
    const position = new vscode.Position(line, 0);
    await vscode.window.showTextDocument(document, { selection: new vscode.Range(position, position) });
    return { ok: true };
  }

  private html(webview: vscode.Webview): string {
    const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    const appUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.webDirectory, "app.js")));
    const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.webDirectory, "style.css")));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
    ].join("; ");

    return fs
      .readFileSync(path.join(this.webDirectory, "index.html"), "utf8")
      .replace(
        '<link rel="stylesheet" href="style.css" />',
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <link rel="stylesheet" href="${styleUri.toString()}" />`
      )
      .replace('<script src="app.js"></script>', `<script nonce="${nonce}" src="${appUri.toString()}"></script>`);
  }
}
