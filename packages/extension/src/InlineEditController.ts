import * as vscode from "vscode";
import type { CoreService, Task, AutoStatus } from "perceptor-core/dist/service";

const FILE_REFERENCE_PATTERN = /(?:^|\s)@([\w/.\\-]+\.\w+)/g;
const POLL_INTERVAL_MS = 2_000;
const ANIMATION_INTERVAL_MS = 400;
const ANIMATION_FRAMES: readonly string[] = [
  "Percepting.",
  "Percepting..",
  "Percepting...",
];

type EnqueueData = { task: { id: string } };
type GraphData = { nodes: { file: string }[] };
type ContextKey = "perceptor.inlineProcessing" | "perceptor.inlineHasTask" | "perceptor.inlineHasAttachments";

function setContextKey(key: ContextKey, value: boolean): void {
  void vscode.commands.executeCommand("setContext", key, value);
}

const PERCEPTOR_AUTHOR: vscode.CommentAuthorInformation = { name: "Perceptor" };

class InlineComment implements vscode.Comment {
  mode = vscode.CommentMode.Preview;
  constructor(
    public body: string | vscode.MarkdownString,
    public author: vscode.CommentAuthorInformation
  ) {}
}

export class InlineEditController {
  readonly commentController: vscode.CommentController;
  private activeThread: vscode.CommentThread | null = null;
  private activeTaskId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private animationTimer: ReturnType<typeof setInterval> | null = null;
  private readonly selectionDecoration: vscode.TextEditorDecorationType;
  private pendingFileRefs: string[] = [];
  private onViewInChatCallback: ((taskId: string) => void) | null = null;
  private cachedGraphFiles: string[] | null = null;

  constructor(private readonly core: CoreService) {
    this.commentController = vscode.comments.createCommentController(
      "perceptor-inline",
      "Perceptor"
    );

    this.selectionDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(106, 161, 255, 0.08)",
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
      borderColor: "#6aa1ff",
      isWholeLine: true,
    });
  }

  setViewInChatCallback(callback: (taskId: string) => void): void {
    this.onViewInChatCallback = callback;
  }

  run(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage("Perceptor: select a code block first.");
      return;
    }

    this.clearActiveThread();
    this.pendingFileRefs = [];
    setContextKey("perceptor.inlineHasAttachments", false);
    setContextKey("perceptor.inlineProcessing", false);
    setContextKey("perceptor.inlineHasTask", false);

    const range = new vscode.Range(editor.selection.start, editor.selection.end);
    editor.setDecorations(this.selectionDecoration, [{ range }]);

    const thread = this.commentController.createCommentThread(
      editor.document.uri,
      range,
      [new InlineComment("Describe what Perceptor should do with the selected code.", PERCEPTOR_AUTHOR)]
    );
    thread.canReply = true;
    thread.label = "Perceptor Inline Edit";
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;

    this.activeThread = thread;
  }

  close(): void {
    this.clearActiveThread();
  }

  async attachFile(): Promise<void> {
    if (!this.activeThread) {
      return;
    }
    const files = await this.loadGraphFiles();
    if (files.length === 0) {
      vscode.window.showWarningMessage("Perceptor: no analyzed files found.");
      return;
    }
    const selected = await vscode.window.showQuickPick(files, {
      placeHolder: "Select a file to reference",
      matchOnDescription: true,
    });
    if (!selected) {
      return;
    }
    this.pendingFileRefs.push(selected);
    setContextKey("perceptor.inlineHasAttachments", true);
    this.updateAttachmentIndicator();
  }

  async removeAttachedFile(): Promise<void> {
    if (!this.activeThread || this.pendingFileRefs.length === 0) {
      return;
    }
    if (this.pendingFileRefs.length === 1) {
      this.pendingFileRefs = [];
      setContextKey("perceptor.inlineHasAttachments", false);
      this.updateAttachmentIndicator();
      return;
    }
    const selected = await vscode.window.showQuickPick(this.pendingFileRefs, {
      placeHolder: "Select a file to remove",
    });
    if (!selected) {
      return;
    }
    this.pendingFileRefs = this.pendingFileRefs.filter((filePath) => filePath !== selected);
    setContextKey("perceptor.inlineHasAttachments", this.pendingFileRefs.length > 0);
    this.updateAttachmentIndicator();
  }

  async stopProcessing(): Promise<void> {
    if (!this.activeTaskId) {
      return;
    }
    await this.core.dispatch("stopProcessing", { taskId: this.activeTaskId });
    this.clearTimers();
    setContextKey("perceptor.inlineProcessing", false);
    if (this.activeThread) {
      this.activeThread.comments = [new InlineComment("Processing stopped.", PERCEPTOR_AUTHOR)];
      this.activeThread.canReply = true;
    }
  }

  viewInChat(): void {
    if (!this.activeTaskId || !this.onViewInChatCallback) {
      vscode.commands.executeCommand("perceptor.open");
      return;
    }
    this.onViewInChatCallback(this.activeTaskId);
  }

  async handleReply(reply: vscode.CommentReply): Promise<void> {
    const description = reply.text.trim();
    if (!description) {
      return;
    }

    const thread = reply.thread;

    if (this.activeTaskId) {
      await this.sendFollowUp(this.activeTaskId, description, thread);
      return;
    }

    const enrichedDescription = await this.enrichWithReferences(description);
    const document = await vscode.workspace.openTextDocument(thread.uri);
    const range = thread.range ?? new vscode.Range(0, 0, 0, 0);
    const taskId = await this.enqueueTask(document, range, enrichedDescription);
    if (!taskId) {
      thread.comments = [new InlineComment("Task could not be created.", PERCEPTOR_AUTHOR)];
      return;
    }

    this.activeTaskId = taskId;
    this.pendingFileRefs = [];
    setContextKey("perceptor.inlineHasAttachments", false);
    setContextKey("perceptor.inlineProcessing", true);
    setContextKey("perceptor.inlineHasTask", true);
    thread.canReply = false;
    this.startAnimation(thread);
    this.startPolling(taskId, thread);
    await this.warnIfAutoDisabled();
  }

  private async sendFollowUp(taskId: string, message: string, thread: vscode.CommentThread): Promise<void> {
    const enrichedMessage = await this.enrichWithReferences(message);
    const response = await this.core.dispatch("updateTask", {
      id: taskId,
      intent: "reply",
      message: enrichedMessage,
      attachments: [],
    });
    if (!response.success) {
      return;
    }
    this.pendingFileRefs = [];
    setContextKey("perceptor.inlineHasAttachments", false);
    setContextKey("perceptor.inlineProcessing", true);
    thread.canReply = false;
    this.startAnimation(thread);
    this.startPolling(taskId, thread);
  }

  private async enrichWithReferences(text: string): Promise<string> {
    const inlineRefs = await this.resolveFileReferences(text);
    if (this.pendingFileRefs.length === 0) {
      return inlineRefs;
    }
    const blocks = await this.readFileContents(this.pendingFileRefs);
    if (blocks.length === 0) {
      return inlineRefs;
    }
    return `${inlineRefs}\n\n${blocks.join("\n\n")}`;
  }

  private async resolveFileReferences(text: string): Promise<string> {
    const matches = [...text.matchAll(FILE_REFERENCE_PATTERN)];
    if (matches.length === 0) {
      return text;
    }
    const graphFiles = await this.loadGraphFiles();
    const resolvedPaths = matches.map((m) => this.resolveToGraphPath(m[1]!, graphFiles));
    const blocks = await this.readFileContents(resolvedPaths);
    if (blocks.length === 0) {
      return text;
    }
    return `${text}\n\n${blocks.join("\n\n")}`;
  }

  private resolveToGraphPath(rawRef: string, graphFiles: string[]): string {
    if (graphFiles.includes(rawRef)) {
      return rawRef;
    }
    const byTail = graphFiles.find((filePath) => filePath.endsWith(`/${rawRef}`) || filePath.endsWith(`\\${rawRef}`));
    return byTail ?? rawRef;
  }

  private async readFileContents(filePaths: string[]): Promise<string[]> {
    const blocks: string[] = [];
    for (const filePath of filePaths) {
      const response = await this.core.dispatch("source", { file: filePath, from: 1, to: 9999 });
      if (!response.success) {
        continue;
      }
      const { code } = response.data as { code: string };
      blocks.push(`[Referenced: ${filePath}]\n\`\`\`\n${code}\n\`\`\``);
    }
    return blocks;
  }

  private async loadGraphFiles(): Promise<string[]> {
    if (this.cachedGraphFiles) {
      return this.cachedGraphFiles;
    }
    const response = await this.core.dispatch("graph", {});
    if (!response.success) {
      return [];
    }
    const graph = response.data as GraphData | null;
    if (!graph) {
      return [];
    }
    const uniqueFiles = new Set<string>();
    for (const node of graph.nodes) {
      uniqueFiles.add(node.file);
    }
    const sorted = [...uniqueFiles].sort();
    this.cachedGraphFiles = sorted;
    return sorted;
  }

  private updateAttachmentIndicator(): void {
    if (!this.activeThread || this.pendingFileRefs.length === 0) {
      return;
    }
    const fileList = this.pendingFileRefs.map((f) => `\u2022 ${f}`).join("\n");
    const existing = this.activeThread.comments;
    const refComment = new InlineComment(
      `Referenced files:\n${fileList}`,
      PERCEPTOR_AUTHOR
    );
    this.activeThread.comments = [...existing.filter(
      (c) => !(typeof c.body === "string" && c.body.startsWith("Referenced files:"))
    ), refComment];
  }

  private async enqueueTask(
    document: vscode.TextDocument,
    range: vscode.Range,
    description: string
  ): Promise<string | null> {
    const relativePath = vscode.workspace.asRelativePath(document.uri, false);
    const startLine = range.start.line + 1;
    const endLine = range.end.line + 1;
    const selectedCode = document.getText(range);
    const contextDescription =
      `[${relativePath}:${startLine}-${endLine}]\n\`\`\`\n${selectedCode}\n\`\`\`\n\n${description}`;

    const response = await this.core.dispatch("enqueueTask", {
      type: "request",
      spec: { description: contextDescription },
    });
    if (!response.success) {
      return null;
    }
    return (response.data as EnqueueData).task.id;
  }

  private startAnimation(thread: vscode.CommentThread): void {
    this.clearTimers();
    let frame = 0;
    const render = (): void => {
      const text = ANIMATION_FRAMES[frame % ANIMATION_FRAMES.length]!;
      frame++;
      thread.comments = [new InlineComment(`\u26A1 ${text}`, PERCEPTOR_AUTHOR)];
    };
    render();
    this.animationTimer = setInterval(render, ANIMATION_INTERVAL_MS);
  }

  private startPolling(taskId: string, thread: vscode.CommentThread): void {
    this.pollTimer = setInterval(
      () => void this.checkCompletion(taskId, thread),
      POLL_INTERVAL_MS
    );
  }

  private async checkCompletion(taskId: string, thread: vscode.CommentThread): Promise<void> {
    const response = await this.core.dispatch("tasks", {});
    if (!response.success) {
      return;
    }
    const { tasks } = response.data as { tasks: Task[] };
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      this.finish(thread, "error", null);
      return;
    }
    if (this.isTerminal(task.status)) {
      this.finish(thread, task.status, task);
    }
  }

  private isTerminal(status: string): boolean {
    return status === "proposed"
      || status === "applied"
      || status === "error"
      || status === "rejected";
  }

  private finish(thread: vscode.CommentThread, status: string, task: Task | null): void {
    this.clearTimers();
    this.clearSelectionHighlight();
    setContextKey("perceptor.inlineProcessing", false);

    const comments: InlineComment[] = [];
    const lastClaudeMessage = this.findLastClaudeMessage(task);

    if (lastClaudeMessage) {
      const summaryMarkdown = new vscode.MarkdownString(lastClaudeMessage);
      summaryMarkdown.supportThemeIcons = true;
      comments.push(new InlineComment(summaryMarkdown, PERCEPTOR_AUTHOR));
    }

    const statusMarkdown = this.buildStatusMarkdown(status);
    comments.push(new InlineComment(statusMarkdown, PERCEPTOR_AUTHOR));

    thread.comments = comments;
    thread.canReply = true;
  }

  private findLastClaudeMessage(task: Task | null): string | null {
    if (!task) {
      return null;
    }
    const messages = (task as Record<string, unknown>)["messages"] as
      | { role: string; text: string }[]
      | undefined;
    if (!messages) {
      return null;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === "claude") {
        return messages[i]!.text;
      }
    }
    return null;
  }

  private buildStatusMarkdown(status: string): vscode.MarkdownString {
    let icon: string;
    let label: string;
    switch (status) {
      case "proposed":
        icon = "$(git-pull-request)";
        label = "Proposal ready \u2014 review in the **Changes** tab.";
        break;
      case "applied":
        icon = "$(check)";
        label = "Changes applied.";
        break;
      case "error":
        icon = "$(error)";
        label = "An error occurred.";
        break;
      case "rejected":
        icon = "$(close)";
        label = "Rejected.";
        break;
      default:
        icon = "$(info)";
        label = "Done.";
        break;
    }
    const markdown = new vscode.MarkdownString(`${icon} ${label}`);
    markdown.supportThemeIcons = true;
    return markdown;
  }

  private async warnIfAutoDisabled(): Promise<void> {
    const response = await this.core.dispatch("autoStatus", {});
    if (!response.success) {
      return;
    }
    const status = response.data as AutoStatus;
    if (!status.enabled) {
      vscode.window.showInformationMessage(
        "Perceptor: task queued. Enable Auto-process or run /perceptor tasks to process it."
      );
    }
  }

  private clearActiveThread(): void {
    this.clearTimers();
    this.clearSelectionHighlight();
    setContextKey("perceptor.inlineHasAttachments", false);
    setContextKey("perceptor.inlineProcessing", false);
    setContextKey("perceptor.inlineHasTask", false);
    if (this.activeThread) {
      this.activeThread.dispose();
      this.activeThread = null;
      this.activeTaskId = null;
    }
  }

  private clearSelectionHighlight(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.selectionDecoration, []);
    }
  }

  private clearTimers(): void {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  dispose(): void {
    this.clearActiveThread();
    this.commentController.dispose();
    this.selectionDecoration.dispose();
    this.cachedGraphFiles = null;
  }
}
