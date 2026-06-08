import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawnSync } from "child_process";
import type { CoreService } from "perceptor-core/dist/service";

type DebugRunnerResult =
  | { readiness: "tested"; testFile: string; framework: string; methodLine: number; language: string; defaultPayload: Record<string, unknown> }
  | { readiness: "untested"; suggestedTestPath: string; framework: string; className: string; methodName: string; language: string; methodLine: number; isAsync: boolean; defaultPayload: Record<string, unknown> };

type ContextKey = "perceptor.simulationActive" | "perceptor.simulationProcessing";

function setContextKey(key: ContextKey, value: boolean): void {
  void vscode.commands.executeCommand("setContext", key, value);
}

type ShellPaths = { npx: string | null; envPath: string | null };
let cachedShellPaths: ShellPaths | undefined;

function resolveShellPaths(): ShellPaths {
  if (cachedShellPaths) return cachedShellPaths;
  const shell = process.env["SHELL"];
  if (!shell) return (cachedShellPaths = { npx: null, envPath: null });
  try {
    const marker = "__PERCEPTOR_PATH__";
    const probe = spawnSync(shell, ["-lic", `command -v npx; echo ${marker}$PATH`], { encoding: "utf8", timeout: 5000 });
    const stdout = probe.stdout || "";
    const pathMatch = new RegExp(`${marker}(.*)`).exec(stdout);
    const npxPath = stdout.split("\n").map((l) => l.trim()).find(
      (l) => l.length > 0 && !l.startsWith(marker) && path.isAbsolute(l) && fs.existsSync(l)
    );
    cachedShellPaths = { npx: npxPath ?? null, envPath: pathMatch?.[1]?.trim() ?? null };
  } catch {
    cachedShellPaths = { npx: null, envPath: null };
  }
  return cachedShellPaths;
}

const PERCEPTOR_AUTHOR: vscode.CommentAuthorInformation = { name: "Perceptor Debugger" };

class DebugComment implements vscode.Comment {
  mode = vscode.CommentMode.Preview;
  constructor(public body: string | vscode.MarkdownString, public author: vscode.CommentAuthorInformation) {}
}

export class InlineDebuggerController {
  readonly commentController: vscode.CommentController;
  private activeThread: vscode.CommentThread | null = null;
  private activeBreakpoint: vscode.SourceBreakpoint | null = null;
  private debugSessionDisposable: vscode.Disposable | null = null;

  private currentUri: vscode.Uri | null = null;
  private currentClassName: string | null = null;
  private currentMethodName: string | null = null;
  private currentFile: string | null = null;
  private currentStartLine = 0;
  private currentEndLine = 0;

  private readonly methodDecoration: vscode.TextEditorDecorationType;

  constructor(private readonly core: CoreService, private readonly workspaceRoot: string) {
    this.commentController = vscode.comments.createCommentController("perceptor-debugger", "Perceptor Debugger");
    this.methodDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255, 213, 79, 0.08)",
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
      borderColor: "#ffd54f",
      isWholeLine: true,
    });
  }

  async startSimulation(uri: vscode.Uri, methodName: string, startLine: number, endLine: number, file: string, className: string): Promise<void> {
    this.clearActiveSession();
    this.currentUri = uri;
    this.currentClassName = className;
    this.currentMethodName = methodName;
    this.currentFile = file;
    this.currentStartLine = startLine;
    this.currentEndLine = endLine;

    this.highlightMethodBody();
    setContextKey("perceptor.simulationActive", true);

    const response = await this.core.dispatch("generateDebugRunner", { file, className, methodName, payload: {} });
    if (!response.success) {
      const errorMessage = (response as { error?: { message?: string } }).error?.message ?? "Debug readiness check failed.";
      vscode.window.showErrorMessage(`Perceptor: ${errorMessage}`);
      this.clearActiveSession();
      return;
    }

    const result = response.data as DebugRunnerResult;
    await this.handleReadiness(result);
  }

  private async handleReadiness(result: DebugRunnerResult): Promise<void> {
    if (result.readiness === "tested") {
      await this.handleTestedMethod(result);
    } else {
      await this.handleUntestedMethod(result);
    }
  }

  private async handleTestedMethod(result: Extract<DebugRunnerResult, { readiness: "tested" }>): Promise<void> {
    this.setBreakpoint();

    // The method has a real test with real mocks. Run that test under its framework
    // so the method executes cleanly (the mocks satisfy domain invariants — no
    // "Basket expired" from a fake dependency). The breakpoint at the source line
    // stops inside the method while the test drives it.
    if (this.isFrameworkRunnable(result.framework)) {
      const launched = await this.launchTestDebug(result.testFile, result.framework);
      if (launched) {
        const statusThread = this.showStatusThread(
          `$(debug-start) Breakpoint at \`${this.currentMethodName}\` · test: \`${path.basename(result.testFile)}\`` +
          this.editValueHint(result.defaultPayload)
        );
        this.listenForDebugEnd(statusThread);
        return;
      }
    }

    // Test exists but its framework isn't installed/launchable — guide the user.
    vscode.window.showWarningMessage(
      `Perceptor: ${result.framework} kurulu değil, ${this.currentMethodName} testi çalıştırılamadı. ` +
      `\`npm i -D ${result.framework}\` ile kur, sonra tekrar dene (test: ${result.testFile}).`
    );
    this.clearActiveSession();
  }

  // Tested methods run under their real mocks, so the value to tweak lives in the
  // running scope — point the user at editing it live at the breakpoint (Debug
  // Console / Variables), which keeps the real dependency behavior intact.
  private editValueHint(defaultPayload: Record<string, unknown>): string {
    const params = Object.keys(defaultPayload);
    if (params.length === 0) return "";
    const example = `${params[0]} = "yeni-değer"`;
    return (
      `\n\n$(edit) **Değeri elle değiştir:** breakpoint'te dur → **Debug Console**'a yaz ` +
      `(ör. \`${example}\`) ya da **Variables** panelinden düzenle → adımla. ` +
      `Gerçek mock'lar korunur. Parametreler: \`${params.join("`, `")}\`.`
    );
  }

  // A detected framework is usable only if its package is actually installed.
  private isFrameworkRunnable(framework: string): boolean {
    if (framework !== "jest" && framework !== "vitest" && framework !== "mocha") return false;
    return fs.existsSync(path.join(this.workspaceRoot, "node_modules", framework));
  }

  // Launch the test under its framework, focused on the method via -t/grep so only
  // its cases run and the breakpoint at the source line is the one that stops.
  private async launchTestDebug(testFile: string, framework: string): Promise<boolean> {
    const absoluteTestFile = path.join(this.workspaceRoot, testFile);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return false;

    const runner = this.resolveTestRunner(framework, absoluteTestFile);
    if (!runner) return false;

    const debugConfig: vscode.DebugConfiguration = {
      type: "node",
      request: "launch",
      name: `Perceptor: ${this.currentClassName}.${this.currentMethodName} (test)`,
      program: runner.entryPoint,
      args: [...runner.args, absoluteTestFile],
      cwd: runner.cwd,
      sourceMaps: true,
      resolveSourceMapLocations: ["**"],
      skipFiles: ["<node_internals>/**"],
      console: "internalConsole",
      internalConsoleOptions: "openOnSessionStart",
      env: this.buildDebugEnv(),
    };
    return vscode.debug.startDebugging(workspaceFolder, debugConfig);
  }

  private resolveTestRunner(framework: string, absoluteTestFile: string): { entryPoint: string; args: string[]; cwd: string } | null {
    const method = this.currentMethodName ?? "";
    const configResult = this.findTestConfig(absoluteTestFile, framework);
    if (framework === "vitest") return this.buildTestRunner("vitest", ["run", "--no-coverage", "--root", this.workspaceRoot, "-t", method], configResult);
    // --roots overrides a config whose `roots` (e.g. ["<rootDir>/src"]) would exclude a
    // perceptor-tests/ file, so a committable test outside src/ still runs.
    if (framework === "jest") return this.buildTestRunner("jest", ["--runInBand", "--no-coverage", "--roots", this.workspaceRoot, "-t", method], configResult);
    if (framework === "mocha") return this.buildTestRunner("mocha", ["--no-timeouts", "--grep", method], configResult);
    return null;
  }

  private buildTestRunner(
    name: string, baseArgs: string[], configResult: { configPath: string | null; cwd: string }
  ): { entryPoint: string; args: string[]; cwd: string } {
    const args = [...baseArgs];
    if (configResult.configPath) args.push("--config", configResult.configPath);
    return { entryPoint: this.findTestEntryPoint(name), args, cwd: configResult.cwd };
  }

  private findTestEntryPoint(name: string): string {
    const fromPackage = this.resolveEntryFromPackageJson(name);
    if (fromPackage) return fromPackage;
    const binPath = path.join(this.workspaceRoot, "node_modules", ".bin", name);
    if (fs.existsSync(binPath)) {
      try {
        const realPath = fs.realpathSync(binPath);
        if (/\.[cm]?[jt]sx?$/.test(realPath)) return realPath;
      } catch { /* fall through */ }
    }
    return binPath;
  }

  private resolveEntryFromPackageJson(name: string): string | null {
    const packageJsonPath = path.join(this.workspaceRoot, "node_modules", name, "package.json");
    if (!fs.existsSync(packageJsonPath)) return null;
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { bin?: string | Record<string, string> };
      const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[name];
      if (!bin) return null;
      const resolved = path.join(this.workspaceRoot, "node_modules", name, bin);
      return fs.existsSync(resolved) ? resolved : null;
    } catch {
      return null;
    }
  }

  private findTestConfig(absoluteTestFile: string, framework: string): { configPath: string | null; cwd: string } {
    const configNames = framework === "vitest"
      ? ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"]
      : framework === "jest"
        ? ["jest.config.ts", "jest.config.js", "jest.config.mjs", "jest.config.json"]
        : [];
    let dir = path.dirname(absoluteTestFile);
    while (dir.startsWith(this.workspaceRoot) && dir !== this.workspaceRoot) {
      for (const name of configNames) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) return { configPath: candidate, cwd: dir };
      }
      dir = path.dirname(dir);
    }
    for (const name of configNames) {
      const rootCandidate = path.join(this.workspaceRoot, name);
      if (fs.existsSync(rootCandidate)) return { configPath: rootCandidate, cwd: this.workspaceRoot };
    }
    return { configPath: null, cwd: this.workspaceRoot };
  }

  private async handleUntestedMethod(result: Extract<DebugRunnerResult, { readiness: "untested" }>): Promise<void> {
    this.showStatusThread(
      `$(warning) **${result.className}.${result.methodName}** — uygun test bulunamadı`
    );

    const createLabel = "Uygun Test Oluştur";
    const cancelLabel = "İptal";
    const action = await vscode.window.showInformationMessage(
      `${result.className}.${result.methodName} için test yok. ` +
      `Gerçek mock'lu bir test üretip onu debug edebilirsin.`,
      createLabel,
      cancelLabel
    );

    if (action === createLabel) {
      await this.promptTestCreation(result);
    }
    this.clearActiveSession();
  }

  private async promptTestCreation(
    result: Extract<DebugRunnerResult, { readiness: "untested" }>
  ): Promise<void> {
    const besideLabel = "Kaynak dosyanın yanına";
    const folderLabel = "perceptor-tests/ klasörüne";
    const choice = await vscode.window.showQuickPick(
      [
        { label: besideLabel, detail: "Claude, kaynak dosyanın yanına commit-edilebilir gerçek bir test üretir." },
        { label: folderLabel, detail: "Claude, perceptor-tests/ klasörüne commit-edilebilir gerçek bir test üretir." },
      ],
      { placeHolder: `${result.className}.${result.methodName} için test nereye üretilsin?` }
    );
    if (!choice) return;

    await this.enqueueTestGenerationTask(result, choice.label === folderLabel ? "folder" : "beside");
  }

  // Both placements go through Claude (the task engine), producing a complete,
  // committable test in the repo working tree — never a gitignored scaffold.
  private async enqueueTestGenerationTask(
    result: Extract<DebugRunnerResult, { readiness: "untested" }>,
    location: "beside" | "folder"
  ): Promise<void> {
    const placement = location === "folder"
      ? "Place it under a committable perceptor-tests/ folder that mirrors the source path (do NOT gitignore it)."
      : "Place it next to the source file, following the repo's beside-source test convention (committable).";
    // Token-friendly but directive: the two failure modes we hit are missing
    // imports for mocked types and empty/TODO mock bodies — spell both out.
    const description =
      `Write a complete, runnable test for ${result.className}.${result.methodName} (${this.currentFile}). ` +
      `Import the class under test AND every type/interface/port used by its mocks. ` +
      `Give each mock a real implementation that returns valid domain objects so the method actually runs — ` +
      `no empty {} casts or TODO stubs. ${placement} ` +
      `Follow existing sibling tests and coding-preferences. Cover the happy path and the key error branches.`;
    await this.core.dispatch("enqueueTask", {
      type: "request",
      spec: { description },
    });
    vscode.window.showInformationMessage(
      `Perceptor: ${result.className}.${result.methodName} için test görevi oluşturuldu — ` +
      `Perceptor → Changes'ten incele ve onayla.`
    );
  }

  private buildDebugEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    const shellPaths = resolveShellPaths();
    if (shellPaths.envPath) env["PATH"] = shellPaths.envPath;
    env["NODE_OPTIONS"] = "";
    env["VSCODE_INSPECTOR_OPTIONS"] = "";
    return env;
  }

  handleReply(_reply: vscode.CommentReply): void {}
  close(): void { this.clearActiveSession(); }

  async stopProcessing(): Promise<void> {
    const activeSession = vscode.debug.activeDebugSession;
    if (activeSession?.name.startsWith("Perceptor:")) await vscode.debug.stopDebugging(activeSession);
  }

  private setBreakpoint(): void {
    this.activeBreakpoint = new vscode.SourceBreakpoint(
      new vscode.Location(this.currentUri!, new vscode.Position(this.currentStartLine - 1, 0))
    );
    vscode.debug.addBreakpoints([this.activeBreakpoint]);
  }

  private listenForDebugEnd(statusThread: vscode.CommentThread): void {
    this.debugSessionDisposable = vscode.debug.onDidTerminateDebugSession((session) => {
      if (session.name.startsWith("Perceptor:")) this.onDebugSessionEnd(statusThread);
    });
  }

  private showStatusThread(initialMessage: string): vscode.CommentThread {
    const position = new vscode.Range(this.currentStartLine - 1, 0, this.currentStartLine - 1, 0);
    const thread = this.commentController.createCommentThread(this.currentUri!, position, [
      new DebugComment(this.markdown(initialMessage), PERCEPTOR_AUTHOR),
    ]);
    thread.canReply = false;
    thread.label = `Debug: ${this.currentClassName}.${this.currentMethodName}`;
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    this.activeThread = thread;
    return thread;
  }

  private onDebugSessionEnd(_thread: vscode.CommentThread): void {
    this.clearActiveSession();
  }

  private highlightMethodBody(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.currentUri || editor.document.uri.toString() !== this.currentUri.toString()) return;
    const range = new vscode.Range(this.currentStartLine - 1, 0, this.currentEndLine - 1, Number.MAX_SAFE_INTEGER);
    editor.setDecorations(this.methodDecoration, [{ range }]);
  }

  private clearDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.currentUri && editor.document.uri.toString() === this.currentUri.toString()) {
        editor.setDecorations(this.methodDecoration, []);
        return;
      }
    }
    const active = vscode.window.activeTextEditor;
    if (active) active.setDecorations(this.methodDecoration, []);
  }

  private removeBreakpoint(): void {
    if (this.activeBreakpoint) {
      vscode.debug.removeBreakpoints([this.activeBreakpoint]);
      this.activeBreakpoint = null;
    }
  }

  private markdown(text: string): vscode.MarkdownString {
    const md = new vscode.MarkdownString(text);
    md.supportThemeIcons = true;
    return md;
  }

  private clearActiveSession(): void {
    this.removeBreakpoint();
    this.clearDecorations();
    this.debugSessionDisposable?.dispose();
    this.debugSessionDisposable = null;
    setContextKey("perceptor.simulationActive", false);
    setContextKey("perceptor.simulationProcessing", false);
    if (this.activeThread) {
      this.activeThread.dispose();
      this.activeThread = null;
    }
    this.currentUri = null;
    this.currentClassName = null;
    this.currentMethodName = null;
    this.currentFile = null;
  }

  dispose(): void {
    this.clearActiveSession();
    this.commentController.dispose();
    this.methodDecoration.dispose();
  }
}
