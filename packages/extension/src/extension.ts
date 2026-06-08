import * as path from "path";
import * as vscode from "vscode";
import { createCoreService, CoreService, type AnalyzerAssets, type FileOpener } from "perceptor-core/dist/service";
import { PerceptorPanel } from "./perceptorPanel";
import { provisionSkill } from "./provisionSkill";
import { InlineEditController } from "./InlineEditController";
import { InlineDebuggerCodeLens } from "./InlineDebuggerCodeLens";
import { InlineDebuggerController } from "./InlineDebuggerController";

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
let inlineEdit: InlineEditController | undefined;
let codeLens: InlineDebuggerCodeLens | undefined;
let inlineDebugger: InlineDebuggerController | undefined;

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
      process.env["PERCEPTOR_CLAUDE_BIN"] = claudePath;
    } else {
      delete process.env["PERCEPTOR_CLAUDE_BIN"];
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
    codeLens?.invalidate();
  }

  if (vscode.workspace.getConfiguration("perceptor").get<boolean>("autoProcessOnOpen", false)) {
    core.setAuto(true);
  }
  PerceptorPanel.show(core, webDirectory(), () => codeLens?.invalidate());
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Perceptor");
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.commands.registerCommand("perceptor.open", openCommand));
  context.subscriptions.push(
    vscode.commands.registerCommand("perceptor.inlineEdit", () => {
      if (!core) {
        vscode.window.showWarningMessage("Perceptor: open Perceptor first (Cmd+Shift+P \u2192 Perceptor: Open).");
        return;
      }
      if (!inlineEdit) {
        inlineEdit = new InlineEditController(core);
        inlineEdit.setViewInChatCallback((taskId) => {
          PerceptorPanel.selectChat(taskId);
        });
        context.subscriptions.push({ dispose: () => inlineEdit?.dispose() });
      }
      inlineEdit.run();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("perceptor.submitInlineEdit", (reply: vscode.CommentReply) => {
      if (inlineEdit) {
        void inlineEdit.handleReply(reply);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("perceptor.closeInlineEdit", () => {
      inlineEdit?.close();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("perceptor.attachFileInlineEdit", () => {
      if (inlineEdit) {
        void inlineEdit.attachFile();
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("perceptor.stopInlineEdit", () => {
      if (inlineEdit) {
        void inlineEdit.stopProcessing();
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("perceptor.removeAttachedFileInlineEdit", () => {
      if (inlineEdit) {
        void inlineEdit.removeAttachedFile();
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("perceptor.viewInChat", () => {
      if (inlineEdit) {
        inlineEdit.viewInChat();
      }
    })
  );

  codeLens = new InlineDebuggerCodeLens(() => core);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLens)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "perceptor.simulate",
      (uri: vscode.Uri, methodName: string, startLine: number, endLine: number, file: string, className: string) => {
        if (!core) {
          vscode.window.showWarningMessage("Perceptor: open Perceptor first (Cmd+Shift+P → Perceptor: Open).");
          return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return;
        }
        if (!inlineDebugger) {
          inlineDebugger = new InlineDebuggerController(core, workspaceRoot);
          context.subscriptions.push({ dispose: () => inlineDebugger?.dispose() });
        }
        void inlineDebugger.startSimulation(uri, methodName, startLine, endLine, file, className);
      }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("perceptor.closeSimulation", () => {
      inlineDebugger?.close();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("perceptor.stopSimulation", () => {
      if (inlineDebugger) {
        void inlineDebugger.stopProcessing();
      }
    })
  );

  // Install the /perceptor Claude skill (the task-processing engine) onto this machine
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
  inlineDebugger?.dispose();
  inlineDebugger = undefined;
  codeLens?.dispose();
  codeLens = undefined;
  inlineEdit?.dispose();
  inlineEdit = undefined;
  core = undefined;
}
