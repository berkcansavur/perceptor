import * as path from "path";
import * as vscode from "vscode";
import { createCoreService, CoreService } from "repo-visualiser/dist/service";
import { VisualiserPanel } from "./visualiserPanel";

let output: vscode.OutputChannel;
let core: CoreService | undefined;

function webDirectory(): string {
  return path.join(path.dirname(require.resolve("repo-visualiser/package.json")), "dist", "web");
}

async function openCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage("Repo Visualiser: open a folder/workspace first.");
    return;
  }

  if (!core) {
    const settings = vscode.workspace.getConfiguration("repoVisualiser");
    process.env["VISUALISE_CLAUDE_BIN"] = settings.get<string>("claudePath", "claude");
    const service = createCoreService(folder.uri.fsPath);
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Repo Visualiser: analyzing…" },
        () => service.init()
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      output.appendLine(`init failed: ${error instanceof Error ? error.stack : reason}`);
      vscode.window.showErrorMessage(`Repo Visualiser: failed to analyze — ${reason}`);
      return;
    }
    core = service;
  }

  if (vscode.workspace.getConfiguration("repoVisualiser").get<boolean>("autoProcessOnOpen", false)) {
    core.setAuto(true);
  }
  VisualiserPanel.show(core, webDirectory(), (message) => output.appendLine(message));
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Repo Visualiser");
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.commands.registerCommand("repoVisualiser.open", openCommand));

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "$(type-hierarchy) Repo Visualiser";
  statusBar.tooltip = "Open the Repo Visualiser map";
  statusBar.command = "repoVisualiser.open";
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate(): void {
  core = undefined;
}
