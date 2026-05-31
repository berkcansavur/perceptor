import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import type { Task, TaskStatus } from "../types";
import { byId, closestEl, escapeHtml } from "../dom";
import { t } from "../i18n";
import { buildChangeTree, sliceMethod, type ChangeFolder, type ChangeStatus, type FileChange } from "./changeTree";
import { parseUnifiedDiff } from "./diffParser";
import { roleLabel } from "../chat/roleLabel";
import { usageBadge } from "../usageBadge";
import { fromBehavior, fromClass, fromFile, specDescription, specName, specSignature, toClass, toFile } from "../taskView";
import { roleColorHex } from "../graph/roleColors";
import { complexityStrip } from "../complexity/complexityStrip";


type BehaviorTarget = {
  className: string;
  file: string;
  methodName: string;
  signature: string;
  marker: string;
  changeClass: string;
}

const REFRESH_MS = 3000;
const STATUS_MARKER: Record<ChangeStatus, string> = { add: "+", edit: "~", out: "−", in: "+" };
const KEY_SEPARATOR = "::";
// An upper bound passed as the source API's "to" line so it returns the whole file; the
// host clamps the slice to the real length, so any value past EOF reads the full file.
const WHOLE_FILE = 1_000_000_000;

function baseName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

// The Changes tab: ONE chat request's change set, opened only by clicking "View
// changes" on that conversation — so it always shows exactly the changes that one
// request produced, never a global list, and never reachable from the top bar. Each
// change reads like Folder mode (the class with its added/edited/removed methods,
// colour-coded green/orange/red); clicking a method reveals its before / after /
// current-on-disk code as separate panes plus its static complexity — never a raw diff.
export class ChangesView {
  private readonly tree = byId("changes-tree");
  private tasksById = new Map<string, Task>();
  private readonly openKeys = new Set<string>();
  // Per-method change info, keyed by its detail key, so clicking a method can show its
  // before/after/current panes and fetch its static complexity. Rebuilt on every render.
  private methodInfoByKey = new Map<
    string,
    { code: string; oldCode: string; name: string; file: string; status: ChangeStatus }
  >();
  private lastJson: string | null = null;
  private focusTaskId: string | null = null;

  constructor(
    private readonly api: Api,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    this.tree.addEventListener("click", (event) => this.onClick(event));
    this.tree.addEventListener("keydown", (event) => this.onKeydown(event));
    this.bus.on("changes:focus", (taskId) => this.focus(taskId));
    setInterval(() => void this.refresh(), REFRESH_MS);
  }

  // Entered only from a chat request's "View changes": focus that one request and
  // switch to the Changes tab. A null id (request lost its diff) just clears.
  private focus(taskId: string | null): void {
    this.focusTaskId = taskId;
    this.lastJson = null;
    if (taskId) {
      this.bus.emit("mode:set", "changes");
    }
    void this.refresh(true);
  }

  private onClick(event: MouseEvent): void {
    const approve = closestEl<HTMLElement>(event.target, "[data-approve]");
    if (approve) {
      void this.update(approve.dataset.approve ?? "", "approved");
      return;
    }
    const reject = closestEl<HTMLElement>(event.target, "[data-reject]");
    if (reject) {
      void this.update(reject.dataset.reject ?? "", "rejected");
      return;
    }
    const openChat = closestEl<HTMLElement>(event.target, "[data-open-chat]");
    if (openChat) {
      this.bus.emit("chat:select", openChat.dataset.openChat ?? "");
      return;
    }
    const stopEl = closestEl<HTMLElement>(event.target, "[data-stop]");
    if (stopEl) {
      void this.stop(stopEl.dataset.stop ?? "");
      return;
    }
    const dismissSet = closestEl<HTMLElement>(event.target, "[data-dismiss-set]");
    if (dismissSet) {
      void this.archive(dismissSet.dataset.dismissSet ?? "");
      return;
    }
    const collapseFile = closestEl<HTMLElement>(event.target, "[data-collapse-file]");
    if (collapseFile && collapseFile.parentElement) {
      collapseFile.parentElement.classList.toggle("collapsed");
      return;
    }
    const toggle = closestEl<HTMLElement>(event.target, "[data-toggle]");
    if (toggle) {
      this.toggleLeaf(toggle.dataset.toggle ?? "");
      return;
    }
    const csetHead = closestEl<HTMLElement>(event.target, "[data-cset]");
    if (csetHead && csetHead.parentElement) {
      csetHead.parentElement.classList.toggle("collapsed");
      return;
    }
    const folderRow = closestEl<HTMLElement>(event.target, ".ctree-folder-row");
    if (folderRow && folderRow.parentElement) {
      folderRow.parentElement.classList.toggle("collapsed");
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter") {
      return;
    }
    const reply = closestEl<HTMLInputElement>(event.target, "[data-reply-task]");
    if (reply && reply.value.trim()) {
      void this.ask(reply.dataset.replyTask ?? "", reply.value.trim());
      reply.value = "";
    }
  }

  private async ask(taskId: string, message: string): Promise<void> {
    await this.api.replyToTask(taskId, message);
    this.bus.emit("toast", t("changes.asked"));
    void this.refresh(true);
  }

  private async update(id: string, status: TaskStatus): Promise<void> {
    await this.api.setTaskStatus(id, status);
    void this.refresh(true);
  }

  // Archive (dismiss) the change set so it stops showing — the record leaves the tab
  // but the code is untouched. Used by the per-set × button.
  private async archive(id: string): Promise<void> {
    if (!id) {
      return;
    }
    await this.api.archiveTask(id);
    this.bus.emit("toast", t("changes.archived"));
    void this.refresh(true);
  }

  // Interrupt one running task to stop spending tokens (others keep running).
  private async stop(taskId: string): Promise<void> {
    await this.api.stopProcessing(taskId);
    this.bus.emit("toast", t("chat.stopped"));
    void this.refresh(true);
  }

  async refresh(force = false): Promise<void> {
    if (!this.focusTaskId) {
      return;
    }
    let changes: Task[] = [];
    try {
      changes = (await this.api.tasks()).filter((task) => Boolean(task.diff) && !task.dismissed);
    } catch {
      return;
    }
    this.tasksById = new Map(changes.map((task) => [task.id, task]));
    const focused = changes.filter((task) => task.id === this.focusTaskId);
    const json = JSON.stringify(focused);
    const isTyping = document.activeElement && document.activeElement.closest("#changes");
    if (!force && (json === this.lastJson || isTyping)) {
      return;
    }
    this.lastJson = json;
    this.renderSets(focused);
    this.reopenDetails();
  }

  private renderSets(tasks: Task[]): void {
    this.methodInfoByKey.clear();
    if (tasks.length === 0) {
      this.tree.innerHTML = `<div class="changes-empty muted">${t("changes.empty")}</div>`;
      return;
    }
    this.tree.innerHTML = tasks.map((task) => this.renderChangeSet(task)).join("");
  }

  private renderChangeSet(task: Task): string {
    const description = specDescription(task) || fromBehavior(task) || t("changes.untitled");
    const body = this.renderBody(task);
    return `<div class="cset">
      <div class="cset-head" data-cset="${task.id}">
        <span class="cset-caret">▾</span>
        <span class="changes-type type-${task.type}">${this.typeLabel(task.type)}</span>
        <span class="cset-desc">${escapeHtml(description)}</span>
        ${
          task.lock
            ? `<span class="processing-chip">⚙ ${t("chat.working")}</span><button class="stop-btn" data-stop="${task.id}" title="${t(
                "chat.stop"
              )}">⏹ ${t("chat.stop")}</button>`
            : `<span class="status-badge status-${task.status}">${t("status." + task.status)}</span>`
        }
        ${usageBadge(task.usage)}
        <button class="cset-dismiss" data-dismiss-set="${task.id}" title="${t("changes.archive")}">×</button>
      </div>
      <div class="cset-body">${body}</div>
    </div>`;
  }

  // Behavior changes render like Folder mode — the class with its new/edited method
  // as a signature row — so a change reads the same as the map. Click the method to
  // expand its diff. Requests/file ops keep the file tree (or raw-diff fallback).
  private renderBody(task: Task): string {
    const target = this.behaviorTarget(task);
    if (target) {
      return this.renderBehaviorFolder(task, target);
    }
    const root = buildChangeTree([task]);
    const hasTree = root.folders.size > 0 || root.files.size > 0;
    return hasTree ? this.renderFolder(root, true) : this.renderRawChange(task);
  }

  private behaviorTarget(task: Task): BehaviorTarget | null {
    if (task.type === "move-behavior") {
      return this.target(toClass(task), toFile(task), fromBehavior(task), fromBehavior(task), "→", "change-in");
    }
    if (task.type === "edit-behavior") {
      return this.target(fromClass(task), fromFile(task), fromBehavior(task), specSignature(task) || fromBehavior(task), "~", "change-edit");
    }
    if (task.type === "add-behavior") {
      const method = specName(task);
      return this.target(fromClass(task), fromFile(task), method, specSignature(task) || method, "+", "change-add");
    }
    return null;
  }

  private target(
    className: string | undefined,
    file: string,
    methodName: string | undefined,
    signature: string | undefined,
    marker: string,
    changeClass: string
  ): BehaviorTarget {
    return {
      className: className ?? "",
      file,
      methodName: methodName ?? "",
      signature: signature ?? methodName ?? "",
      marker,
      changeClass,
    };
  }

  private renderBehaviorFolder(task: Task, target: BehaviorTarget): string {
    const dir = target.file.includes("/") ? target.file.slice(0, target.file.lastIndexOf("/")) : "";
    const key = this.key(task.id, target.file);
    const signature = this.behaviorSignature(target.signature || target.methodName);
    return `<div class="cset-folder">
      ${dir ? `<div class="cset-path muted">${escapeHtml(dir)}/</div>` : ""}
      <div class="tree-row tree-class-row" style="border-left:3px solid ${roleColorHex(target.className)}">
        <span class="kind-badge kind-class">class</span>
        <span class="tree-class-name">${escapeHtml(target.className)}</span>
      </div>
      <div class="behavior cset-behavior ${target.changeClass}" data-toggle="${key}">
        <span class="ctree-marker">${target.marker}</span>
        <span class="behavior-sig">${signature}</span>
      </div>
      <div class="ctree-detail hidden" data-detail="${key}"></div>
    </div>`;
  }

  // Format a "name(params): returnType" signature with the Folder-mode parts/styles.
  private behaviorSignature(signature: string): string {
    const match = /^\s*([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*:?\s*(.*)$/.exec(signature);
    if (!match) {
      return `<span class="behavior-name">${escapeHtml(signature)}</span>`;
    }
    const [, name = "", params = "", returnType = ""] = match;
    const ret = returnType.trim();
    return `<span class="behavior-name">${escapeHtml(name)}</span><span class="behavior-params">(${escapeHtml(
      params
    )})</span>${ret ? ` <span class="behavior-return">${escapeHtml(ret)}</span>` : ""}`;
  }

  // Fallback for a diff with no recognisable file/method structure: still avoid the
  // interleaved git look — split it into a removed-side block and an added-side block —
  // and keep the set actionable (impact, conversation, reply box, approve/reject).
  private renderRawChange(task: Task): string {
    const rows = (task.diff ?? "").split("\n");
    const removed = rows.filter((line) => !line.startsWith("+")).map((line) => this.stripMarker(line)).join("\n");
    const added = rows.filter((line) => !line.startsWith("-")).map((line) => this.stripMarker(line)).join("\n");
    const actions =
      task.status === "proposed"
        ? `<div class="changes-actions"><button class="primary" data-approve="${task.id}">${t(
            "task.approve"
          )}</button><button data-reject="${task.id}">${t("task.reject")}</button></div>`
        : "";
    return `<div class="cset-raw">
        ${this.impactBlock(task)}
        <div class="cx-region">${this.codeBlock("changes.removed", "cx-before", removed)}${this.codeBlock(
          "changes.added",
          "cx-after",
          added
        )}</div>
        ${this.messagesBlock(task)}
        <input class="ctree-reply" data-reply-task="${task.id}" placeholder="${t("changes.reply")}" />
        ${actions}
      </div>`;
  }

  private stripMarker(line: string): string {
    return line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") ? line.slice(1) : line;
  }

  private renderFolder(folder: ChangeFolder, isRoot: boolean): string {
    const folders = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
    const files = [...folder.files.values()].sort((a, b) => a.path.localeCompare(b.path));
    const children = [
      ...folders.map(
        (child) => `<div class="ctree-folder">
          <div class="ctree-row ctree-folder-row"><span class="ctree-caret">▾</span><span class="ctree-folder-name">${escapeHtml(
            child.name
          )}</span></div>
          <div class="ctree-children">${this.renderFolder(child, false)}</div>
        </div>`
      ),
      ...files.map((file) => this.renderTreeFile(file)),
    ].join("");
    return isRoot ? `<div class="ctree-root">${children}</div>` : children;
  }

  // A changed file rendered exactly like Folder mode: a CLASS row (the file = its class)
  // coloured by create/edit/delete, then one behavior row per changed method
  // (green +new / orange ~edited / red −deleted). The class row is a pure header — it only
  // collapses its method list, it never dumps a file-level diff. Clicking a method reveals
  // that method's before/after/current. A file whose diff touches no method (imports, SQL,
  // config) falls back to a single file-reference row that opens its changed regions.
  private renderTreeFile(file: FileChange): string {
    if (!file.taskId) {
      return "";
    }
    const fileKey = this.key(file.taskId, file.path);
    const className = baseName(file.path).replace(/\.[^.]+$/, "");
    const stat =
      file.added || file.removed
        ? `<span class="ctree-stat"><span class="diff-add-stat">+${file.added}</span><span class="diff-del-stat">−${file.removed}</span></span>`
        : "";
    const statusClass = file.status ? ` change-${file.status}` : "";
    if (file.methods.length === 0) {
      const referenceRow = `<div class="tree-row tree-class-row${statusClass}" style="border-left:3px solid ${roleColorHex(
        className
      )}" data-toggle="${fileKey}">
          <span class="kind-badge kind-file">file</span>
          <span class="tree-class-name">${escapeHtml(className)}</span>
          ${stat}
        </div>`;
      return `<div class="ctree-file">${referenceRow}<div class="ctree-detail hidden" data-detail="${fileKey}"></div></div>`;
    }
    const classRow = `<div class="tree-row tree-class-row${statusClass}" style="border-left:3px solid ${roleColorHex(
      className
    )}" data-collapse-file>
        <span class="ctree-caret">▾</span>
        <span class="kind-badge kind-class">class</span>
        <span class="tree-class-name">${escapeHtml(className)}</span>
        <span class="tree-count">${file.methods.length}</span>
        ${stat}
      </div>`;
    const behaviors = file.methods
      .map((method, index) => {
        const methodKey = `${fileKey}${KEY_SEPARATOR}${index}`;
        this.methodInfoByKey.set(methodKey, {
          code: method.code,
          oldCode: method.oldCode,
          name: method.name,
          file: file.path,
          status: method.status,
        });
        return `<div class="cset-behavior change-${method.status}" data-toggle="${methodKey}"><span class="ctree-marker">${
          STATUS_MARKER[method.status]
        }</span><span class="behavior-sig">${this.behaviorSignature(method.label)}</span></div>
        <div class="ctree-detail hidden" data-detail="${methodKey}"></div>`;
      })
      .join("");
    return `<div class="ctree-file">${classRow}<div class="tree-behaviors">${behaviors}</div></div>`;
  }

  private query<T extends Element>(selector: string): T | null {
    return this.tree.querySelector<T>(selector);
  }

  private toggleLeaf(key: string): void {
    const detail = this.query<HTMLElement>(`[data-detail="${key}"]`);
    if (!detail) {
      return;
    }
    if (this.openKeys.has(key)) {
      this.openKeys.delete(key);
      detail.classList.add("hidden");
      detail.innerHTML = "";
    } else {
      this.openKeys.add(key);
      this.fillDetail(key, detail);
    }
  }

  private reopenDetails(): void {
    for (const key of [...this.openKeys]) {
      const detail = this.query<HTMLElement>(`[data-detail="${key}"]`);
      if (detail) {
        this.fillDetail(key, detail);
      } else {
        this.openKeys.delete(key);
      }
    }
  }

  private fillDetail(key: string, detail: HTMLElement): void {
    const parts = key.split(KEY_SEPARATOR);
    const taskId = parts[0] ?? "";
    const task = this.tasksById.get(taskId);
    if (!task) {
      return;
    }
    const isMethod = parts.length >= 3;
    detail.innerHTML = isMethod
      ? `<div class="cx-host" data-cx-host="${key}"></div><div class="cx-code" data-cx-code="${key}"></div>${this.renderDetail(
          task
        )}`
      : `${this.regionsHtml(task, parts[1] ?? "")}${this.renderDetail(task)}`;
    detail.classList.remove("hidden");
    if (isMethod) {
      void this.fillComplexity(key);
      void this.fillCode(key);
    }
  }

  // A clicked method shows its static complexity at the very top of the detail, above
  // the existing explanation + chat. When the full method body isn't in the diff, we say
  // so and point to Folder mode rather than computing on a fragment.
  private async fillComplexity(key: string): Promise<void> {
    const host = this.query<HTMLElement>(`[data-cx-host="${key}"]`);
    if (!host) {
      return;
    }
    const info = this.methodInfoByKey.get(key);
    if (!info || !info.code) {
      host.innerHTML = `<span class="cx-unavailable">${t("cx.unavailable")}</span>`;
      return;
    }
    try {
      const report = await this.api.complexity(info.code, info.name);
      host.innerHTML = complexityStrip(report);
    } catch {
      host.innerHTML = "";
    }
  }

  // The clicked method's code as separated panes — never an interleaved diff: its old
  // body (Before), its new body (After), and the live on-disk body (Current, fetched and
  // sliced by the same brace matcher). Each pane is shown only when its text exists, so a
  // pure addition skips Before and a pure deletion skips After/Current.
  private async fillCode(key: string): Promise<void> {
    const host = this.query<HTMLElement>(`[data-cx-code="${key}"]`);
    const info = this.methodInfoByKey.get(key);
    if (!host || !info) {
      return;
    }
    const before = this.codeBlock("changes.before", "cx-before", info.oldCode);
    const after = this.codeBlock("changes.after", "cx-after", info.code);
    host.innerHTML = before + after;
    const current = await this.currentMethod(info.file, info.name, info.status);
    host.innerHTML = before + after + this.codeBlock("changes.current", "cx-current", current);
  }

  // The method's current body straight from disk: read the file via the source API, then
  // carve the named method out with the shared brace matcher. Empty for a deleted method
  // (nothing left) or when the live file no longer holds a matching declaration.
  private async currentMethod(file: string, name: string, status: ChangeStatus): Promise<string> {
    if (status === "out" || !file || !name) {
      return "";
    }
    try {
      const content = await this.api.source(file, "1", String(WHOLE_FILE));
      return sliceMethod(content, name);
    } catch {
      return "";
    }
  }

  // One labelled code pane; blank when there's no code, so callers can concatenate panes
  // without guarding each one.
  private codeBlock(labelKey: string, variant: string, code: string): string {
    if (!code.trim()) {
      return "";
    }
    return `<div class="cx-block ${variant}"><div class="cx-block-label">${t(
      labelKey
    )}</div><pre class="cx-pre">${escapeHtml(code)}</pre></div>`;
  }

  // A file/non-method change as separated panes per hunk — the removed-side (context +
  // deletions) above, the added-side (context + additions) below — so the reader sees the
  // before and after as two clean blocks instead of an interleaved git diff. Hunks with no
  // real change (before === after) are dropped.
  private regionsHtml(task: Task, filePath: string): string {
    const file = parseUnifiedDiff(task.diff ?? "").find((candidate) => candidate.path === filePath);
    if (!file) {
      return "";
    }
    return file.hunks
      .map((hunk) => {
        const before = hunk.lines.filter((line) => line.kind === "del" || line.kind === "context").map((line) => line.text).join("\n");
        const after = hunk.lines.filter((line) => line.kind === "add" || line.kind === "context").map((line) => line.text).join("\n");
        if (before === after) {
          return "";
        }
        return `<div class="cx-region">${this.codeBlock("changes.removed", "cx-before", before)}${this.codeBlock(
          "changes.added",
          "cx-after",
          after
        )}</div>`;
      })
      .join("");
  }

  // A short, readable change card — NOT a raw git diff. Signature + a terse summary +
  // impact, the conversation, a reply box to continue, and a "View in chat" jump. The
  // line-level diff intentionally lives in the editor, not here.
  private renderDetail(task: Task): string {
    const signatureText = specSignature(task);
    const signature = signatureText
      ? `<div class="changes-field"><span class="changes-field-label">${t(
          "changes.signature"
        )}</span><code class="changes-sig">${escapeHtml(signatureText)}</code></div>`
      : "";
    const summaryText = specDescription(task);
    const summary = summaryText
      ? `<div class="changes-field"><span class="changes-field-label">${t(
          "changes.summary"
        )}</span><span class="changes-summary">${escapeHtml(summaryText)}</span></div>`
      : "";
    const actions =
      task.status === "proposed"
        ? `<div class="changes-actions"><button class="primary" data-approve="${task.id}">${t(
            "task.approve"
          )}</button><button data-reject="${task.id}">${t("task.reject")}</button></div>`
        : "";
    return `<div class="ctree-detail-head">
        <span class="changes-type type-${task.type}">${this.typeLabel(task.type)}</span>
        <span class="status-badge status-${task.status}">${t("status." + task.status)}</span>
        <button class="changes-open-chat" data-open-chat="${task.id}">${t("changes.viewInChat")}</button>
      </div>
      ${signature}
      ${summary}
      ${this.impactBlock(task)}
      ${this.messagesBlock(task)}
      <input class="ctree-reply" data-reply-task="${task.id}" placeholder="${t("changes.reply")}" />
      ${actions}`;
  }

  private messagesBlock(task: Task): string {
    const messages = task.messages ?? [];
    if (messages.length === 0) {
      return "";
    }
    const items = messages
      .map(
        (message) =>
          `<div class="ctree-msg ctree-msg-${message.role}"><b>${escapeHtml(roleLabel(message.role))}:</b> ${escapeHtml(
            message.text
          )}</div>`
      )
      .join("");
    return `<div class="ctree-messages">${items}</div>`;
  }

  private impactBlock(task: Task): string {
    const notes = task.impact?.notes ?? [];
    if (notes.length === 0) {
      return "";
    }
    const risk = task.impact?.risk ?? "low";
    const items = notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");
    return `<div class="changes-impact risk-${risk}"><span class="risk-dot"></span><span class="risk-label">${t(
      "risk." + risk
    )}</span><ul class="impact-notes">${items}</ul></div>`;
  }

  private typeLabel(type: string): string {
    const labels: Record<string, string> = {
      "add-behavior": t("changes.addBehavior"),
      "edit-behavior": t("changes.editBehavior"),
      "move-behavior": t("changes.moveBehavior"),
      "create-file": t("create.file"),
      "create-folder": t("create.folder"),
      request: t("changes.request"),
    };
    return labels[type] ?? type;
  }

  private key(taskId: string, filePath: string): string {
    return `${taskId}${KEY_SEPARATOR}${filePath}`;
  }
}
