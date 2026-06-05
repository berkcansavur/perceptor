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
export class VisualiserPanel {
  private static current: VisualiserPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly core: CoreService,
    private readonly webDirectory: string
  ) {
    this.panel = vscode.window.createWebviewPanel("perceptor", "Perceptor", vscode.ViewColumn.One, {
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

  static show(core: CoreService, webDirectory: string): void {
    if (VisualiserPanel.current) {
      VisualiserPanel.current.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    VisualiserPanel.current = new VisualiserPanel(core, webDirectory);
  }

  static selectChat(taskId: string): void {
    if (!VisualiserPanel.current) {
      return;
    }
    VisualiserPanel.current.panel.reveal(vscode.ViewColumn.One);
    void VisualiserPanel.current.panel.webview.postMessage({ type: "selectChat", taskId });
  }

  // Every action — including openFile — flows through core.dispatch, which always
  // answers with an ApiResponse envelope (its funnel maps any failure), so the host
  // just forwards the result. The editor work for openFile is the FileOpener the
  // extension injects when it builds the CoreService.
  private async onMessage(message: RpcMessage): Promise<void> {
    const result = await this.core.dispatch(message.action, message.payload);
    void this.panel.webview.postMessage({ id: message.id, result });
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
