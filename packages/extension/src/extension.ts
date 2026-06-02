import * as path from "path";
import * as vscode from "vscode";
import { createCoreService, CoreService, type AnalyzerAssets, type FileOpener } from "perceptor-core/dist/service";
import { VisualiserPanel } from "./visualiserPanel";
import { provisionSkill } from "./provisionSkill";

// The host capability the core can't provide: reveal a file in the editor at a line.
// The core resolves the repo-relative path to an absolute one before calling this.
const editorFileOpener: FileOpener = {
  async open(absolutePath: string, line: number): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
    const position = new vscode.Position(line, 0);
    await vscode.window.showTextDocument(document, { selection: new vscode.Range(position, position) });
  },
};

let output: vscode.OutputChannel;
let core: CoreService | undefined;

// The bundle and its assets ship together: extension.js sits in dist/, so the webview
// build and the tree-sitter .wasm files are resolved relative to it (__dirname), never
// from node_modules — that's what makes the packaged .vsix self-contained.
function webDirectory(): string {
  return path.join(__dirname, "web");
}

function analyzerAssets(): AnalyzerAssets {
  const wasmDirectory = path.join(__dirname, "wasm");
  return { wasmDirectory, runtimeWasm: path.join(wasmDirectory, "tree-sitter.wasm") };
}

async function openCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage("Perceptor: open a folder/workspace first.");
    return;
  }

  if (!core) {
    // Only treat the setting as an explicit override when the user set one; left empty
    // (the default) it stays unset so the core auto-detects via the login shell.
    const claudePath = vscode.workspace.getConfiguration("perceptor").get<string>("claudePath", "").trim();
    if (claudePath) {
      process.env["VISUALISE_CLAUDE_BIN"] = claudePath;
    } else {
      delete process.env["VISUALISE_CLAUDE_BIN"];
    }
    const service = createCoreService(folder.uri.fsPath, null, editorFileOpener, analyzerAssets());
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Perceptor: analyzing…" },
        () => service.init()
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      output.appendLine(`init failed: ${error instanceof Error ? error.stack : reason}`);
      vscode.window.showErrorMessage(`Perceptor: failed to analyze — ${reason}`);
      return;
    }
    core = service;
  }

  if (vscode.workspace.getConfiguration("perceptor").get<boolean>("autoProcessOnOpen", false)) {
    core.setAuto(true);
  }
  VisualiserPanel.show(core, webDirectory());
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Perceptor");
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.commands.registerCommand("perceptor.open", openCommand));

  // Install the /visualise Claude skill (the task-processing engine) onto this machine
  // so the extension works with zero per-user setup. Idempotent — a no-op once installed.
  provisionSkill((message) => output.appendLine(message));

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "$(type-hierarchy) Perceptor";
  statusBar.tooltip = "Open the Perceptor map";
  statusBar.command = "perceptor.open";
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate(): void {
  core = undefined;
}
