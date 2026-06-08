import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { CoreService } from "perceptor-core/dist/service";
import { createNonce, renderWebviewHtml } from "./webviewHtml";

type RpcMessage = {
  id: number;
  action: string;
  payload: Record<string, unknown>;
}

// Hosts the UI in a webview and bridges the webview message channel to the
// CoreService — no HTTP, no localhost. Assets load via asWebviewUri.
export class PerceptorPanel {
  private static current: PerceptorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly core: CoreService,
    private readonly webDirectory: string,
    private readonly onReanalyze: () => void
  ) {
    this.panel = vscode.window.createWebviewPanel("perceptor", "Perceptor", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(this.webDirectory)],
    });
    this.panel.webview.html = this.html(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: RpcMessage) => void this.onMessage(message));
    this.panel.onDidDispose(() => {
      PerceptorPanel.current = undefined;
    });
  }

  static show(core: CoreService, webDirectory: string, onReanalyze: () => void = () => {}): void {
    if (PerceptorPanel.current) {
      PerceptorPanel.current.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    PerceptorPanel.current = new PerceptorPanel(core, webDirectory, onReanalyze);
  }

  static selectChat(taskId: string): void {
    if (!PerceptorPanel.current) {
      return;
    }
    PerceptorPanel.current.panel.reveal(vscode.ViewColumn.One);
    void PerceptorPanel.current.panel.webview.postMessage({ type: "selectChat", taskId });
  }

  // Every action — including openFile — flows through core.dispatch, which always
  // answers with an ApiResponse envelope (its funnel maps any failure), so the host
  // just forwards the result. The editor work for openFile is the FileOpener the
  // extension injects when it builds the CoreService.
  private async onMessage(message: RpcMessage): Promise<void> {
    const result = await this.core.dispatch(message.action, message.payload);
    void this.panel.webview.postMessage({ id: message.id, result });
    // A re-analyze rebuilds the graph and re-reads tests; refresh the editor's
    // CodeLens badges (tested/untested) too, not just the webview.
    if (message.action === "reanalyze" && (result as { success?: boolean })?.success) {
      this.onReanalyze();
    }
  }

  private html(webview: vscode.Webview): string {
    const toUri = (file: string): string =>
      webview.asWebviewUri(vscode.Uri.file(path.join(this.webDirectory, file))).toString();
    return renderWebviewHtml({
      template: fs.readFileSync(path.join(this.webDirectory, "index.html"), "utf8"),
      cspSource: webview.cspSource,
      nonce: createNonce(),
      styleUri: toUri("style.css"),
      scriptUri: toUri("app.js"),
    });
  }
}
