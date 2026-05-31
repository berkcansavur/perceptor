import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import type { Task } from "../types";
import { byId, closestEl, escapeHtml } from "../dom";
import { t } from "../i18n";
import { parseUnifiedDiff, type DiffHunk } from "./diffParser";
import { buildChangeTree, type ChangeFolder, type ChangeStatus, type FileChange } from "./changeTree";
import { isTaskCommitted, type GitState } from "./commitState";
import { regionMessage } from "./regionMessage";
import { roleLabel } from "../chat/roleLabel";
import { usageBadge } from "../usageBadge";
import { fromBehavior, fromClass, fromFile, specDescription, specName, specSignature, toClass, toFile } from "../taskView";
import { roleColorHex } from "../graph/roleColors";


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

type ChangeGroup = {
  label: string;
  scope: string;
  tasks: Task[];
}

function baseName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

// Two tabs over the same per-ister change sets, split by git state:
//   Pending   — proposed + applied-but-uncommitted changes (this session's work).
//   Changes   — changes whose files are already committed (clean in git).
// A change moves Pending → Changes once you commit it; with no git repo nothing is
// ever "committed", so Changes stays empty. Each set expands to its line-by-line
// diff; every hunk has an Ask/Modify box that sends a region-tagged request to Claude.
export class ChangesView {
  private readonly pendingTree = byId("pending-tree");
  private readonly committedTree = byId("changes-tree");
  private tasksById = new Map<string, Task>();
  private readonly openKeys = new Set<string>();
  private dirtyFiles = new Set<string>();
  private trackedFiles = new Set<string>();
  private isRepo = false;
  private lastJson: string | null = null;
  private focusTaskId: string | null = null;
  private focusJustSet = false;

  constructor(
    private readonly api: Api,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    for (const tree of [this.pendingTree, this.committedTree]) {
      tree.addEventListener("click", (event) => this.onClick(event));
      tree.addEventListener("keydown", (event) => this.onKeydown(event));
    }
    this.bus.on("changes:focus", (taskId) => {
      this.focusTaskId = taskId;
      this.focusJustSet = taskId !== null;
      this.lastJson = null;
      void this.refresh(true);
    });
    void this.refresh(true);
    setInterval(() => void this.refresh(), REFRESH_MS);
  }

  private onClick(event: MouseEvent): void {
    const ask = closestEl<HTMLElement>(event.target, "[data-ask]");
    if (ask) {
      this.toggleAskBox(ask.dataset.ask ?? "");
      return;
    }
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
    if (closestEl<HTMLElement>(event.target, "[data-open-chat]")) {
      this.bus.emit("mode:set", "chat");
      return;
    }
    if (closestEl<HTMLElement>(event.target, "[data-show-all]")) {
      this.bus.emit("changes:focus", null);
      return;
    }
    const stopEl = closestEl<HTMLElement>(event.target, "[data-stop]");
    if (stopEl) {
      void this.stop(stopEl.dataset.stop ?? "");
      return;
    }
    const dismissSet = closestEl<HTMLElement>(event.target, "[data-dismiss-set]");
    if (dismissSet) {
      void this.archive([dismissSet.dataset.dismissSet ?? ""]);
      return;
    }
    const clearGroup = closestEl<HTMLElement>(event.target, "[data-clear-group]");
    if (clearGroup) {
      const group = closestEl<HTMLElement>(clearGroup, ".cgroup");
      if (group) {
        void this.clearScope(group);
      }
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
    const region = closestEl<HTMLInputElement>(event.target, "[data-ask-region]");
    if (region && region.value.trim()) {
      void this.ask(region.dataset.askTask ?? "", regionMessage(region.dataset.askRegion ?? "", region.value.trim()));
      region.value = "";
      return;
    }
    const reply = closestEl<HTMLInputElement>(event.target, "[data-reply-task]");
    if (reply && reply.value.trim()) {
      void this.ask(reply.dataset.replyTask ?? "", reply.value.trim());
      reply.value = "";
    }
  }

  private async ask(taskId: string, message: string): Promise<void> {
    await this.api.updateTask(taskId, { message, role: "user" });
    this.bus.emit("toast", t("changes.asked"));
    void this.refresh(true);
  }

  private async update(id: string, status: string): Promise<void> {
    await this.api.updateTask(id, { status });
    void this.refresh(true);
  }

  // Archive (dismiss) change sets so they stop piling up — the records leave both
  // tabs but the code is untouched. Used by per-set × and the tab's Clear button.
  private async archive(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      if (id) {
        await this.api.updateTask(id, { dismissed: true });
      }
    }
    this.bus.emit("toast", t("changes.archived"));
    void this.refresh(true);
  }

  private clearScope(tree: HTMLElement): Promise<void> {
    const ids = [...tree.querySelectorAll<HTMLElement>("[data-cset]")].map((head) => head.dataset.cset ?? "");
    return this.archive(ids);
  }

  // Interrupt one running task to stop spending tokens (others keep running).
  private async stop(taskId: string): Promise<void> {
    await this.api.stopProcessing(taskId);
    this.bus.emit("toast", t("chat.stopped"));
    void this.refresh(true);
  }

  async refresh(force = false): Promise<void> {
    let changes: Task[] = [];
    try {
      changes = (await this.api.tasks()).filter((task) => Boolean(task.diff) && !task.dismissed);
    } catch {
      return;
    }
    await this.loadGitStatus();
    this.tasksById = new Map(changes.map((task) => [task.id, task]));
    // Two tabs: Pending = this session's local work you can still observe/act on
    // (proposed awaiting approval + applied-but-uncommitted); Changes = committed
    // (git-based). An applied change stays in Pending — its diff is observable there —
    // until you commit it, then it moves to Changes.
    const committed = changes.filter((task) => isTaskCommitted(task, this.gitState()));
    const pending = changes.filter((task) => this.isPending(task));

    byId("pending-count").textContent = String(pending.length);
    byId("changes-count").textContent = String(committed.length);
    this.reflectTabVisibility("pending", "mode-pending", pending.length > 0);
    this.reflectTabVisibility("changes", "mode-changes", committed.length > 0);
    this.revealFocusTab(pending, committed);

    const json = `${JSON.stringify(changes)}|${[...this.dirtyFiles].sort().join(",")}|${[...this.trackedFiles]
      .sort()
      .join(",")}|${this.isRepo}|${this.focusTaskId ?? ""}`;
    const isTyping =
      document.activeElement &&
      (document.activeElement.closest("#pending") || document.activeElement.closest("#changes"));
    if (!force && (json === this.lastJson || isTyping)) {
      return;
    }
    this.lastJson = json;
    this.renderGroups(this.pendingTree, [{ label: "", scope: "pending", tasks: pending }]);
    this.renderGroups(this.committedTree, [{ label: "", scope: "committed", tasks: committed }]);
    this.reopenDetails();
  }

  // Local work still surfaced in the Pending tab: a proposal awaiting approval, or an
  // applied change not yet committed (so its diff stays observable until it lands in git).
  private isPending(task: Task): boolean {
    if (task.status === "proposed") {
      return true;
    }
    return task.status === "applied" && !isTaskCommitted(task, this.gitState());
  }

  private gitState(): GitState {
    return { isRepo: this.isRepo, dirtyFiles: this.dirtyFiles, trackedFiles: this.trackedFiles };
  }

  private async loadGitStatus(): Promise<void> {
    try {
      const status = await this.api.gitStatus();
      this.isRepo = status.isRepo;
      this.dirtyFiles = new Set(status.dirtyFiles);
      this.trackedFiles = new Set(status.trackedFiles);
    } catch {
      this.isRepo = false;
      this.dirtyFiles = new Set();
      this.trackedFiles = new Set();
    }
  }

  private scoped(tasks: Task[]): Task[] {
    return this.focusTaskId ? tasks.filter((task) => task.id === this.focusTaskId) : tasks;
  }

  // A chat request's "View changes" jumps to whichever tab now owns it — Pending while
  // uncommitted, Changes once committed.
  private revealFocusTab(pending: Task[], committed: Task[]): void {
    if (!this.focusJustSet || !this.focusTaskId) {
      return;
    }
    this.focusJustSet = false;
    if (committed.some((task) => task.id === this.focusTaskId)) {
      this.bus.emit("mode:set", "changes");
    } else if (pending.some((task) => task.id === this.focusTaskId)) {
      this.bus.emit("mode:set", "pending");
    }
  }

  // A tab only exists while it has content. If the active one empties (and we're not
  // focused on a specific request), fall back to Folder mode.
  private reflectTabVisibility(section: string, modeButton: string, has: boolean): void {
    byId(modeButton).classList.toggle("hidden", !has);
    if (!has && !this.focusTaskId && !byId(section).classList.contains("hidden")) {
      this.bus.emit("mode:set", "folder");
    }
  }

  // Each task is its own change set — a request (or a drag-drop behavior change) is
  // one unit of work, like a commit. Sets are grouped (e.g. task-based vs commit-based);
  // each group has a Clear, and each set its own × — archiving only hides the record.
  private renderGroups(tree: HTMLElement, groups: ChangeGroup[]): void {
    const banner = this.renderFocusBanner();
    const visible = groups
      .map((group) => ({ ...group, tasks: this.scoped(group.tasks) }))
      .filter((group) => group.tasks.length > 0);
    if (visible.length === 0) {
      tree.innerHTML = `${banner}<div class="changes-empty muted">${t("changes.empty")}</div>`;
      return;
    }
    tree.innerHTML = banner + visible.map((group) => this.renderGroup(group)).join("");
  }

  private renderGroup(group: ChangeGroup): string {
    const clear = this.focusTaskId
      ? ""
      : `<button class="changes-clear-btn" data-clear-group>${t("changes.clear")}</button>`;
    const header = group.label
      ? `<div class="cgroup-head"><span class="cgroup-label">${escapeHtml(group.label)}</span>${clear}</div>`
      : `<div class="changes-clear-bar">${clear}</div>`;
    const sets = [...group.tasks]
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .map((task) => this.renderChangeSet(task))
      .join("");
    return `<div class="cgroup">${header}${sets}</div>`;
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
    const match = /^\s*([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*:?\s*(.*)$/.exec(signature);
    if (!match) {
      return `<span class="behavior-name">${escapeHtml(signature)}</span>`;
    }
    const [, name = "", params = "", returnType = ""] = match;
    const ret = returnType.trim();
    return `<span class="behavior-name">${escapeHtml(name)}</span><span class="behavior-params">(${escapeHtml(
      params
    )})</span>${ret ? ` <span class="behavior-return">${escapeHtml(ret)}</span>` : ""}`;
  }

  // Fallback for a non-unified diff: colour +/- lines and keep the set actionable
  // (impact, conversation, reply box, approve/reject).
  private renderRawChange(task: Task): string {
    const lines = (task.diff ?? "")
      .split("\n")
      .map((line) => {
        const kind = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "context";
        return `<div class="diff-line diff-${kind}">${escapeHtml(line || " ")}</div>`;
      })
      .join("");
    const actions =
      task.status === "proposed"
        ? `<div class="changes-actions"><button class="primary" data-approve="${task.id}">${t(
            "task.approve"
          )}</button><button data-reject="${task.id}">${t("task.reject")}</button></div>`
        : "";
    return `<div class="cset-raw">
        ${this.impactBlock(task)}
        <div class="cset-rawdiff">${lines}</div>
        ${this.messagesBlock(task)}
        <input class="ctree-reply" data-reply-task="${task.id}" placeholder="${t("changes.reply")}" />
        ${actions}
      </div>`;
  }

  // When opened from a chat request ("View changes"), the tab shows only that
  // request's changes — its own change set. The banner clears back to all changes.
  private renderFocusBanner(): string {
    if (!this.focusTaskId) {
      return "";
    }
    const task = this.tasksById.get(this.focusTaskId);
    const label = task ? specDescription(task) || fromBehavior(task) : "";
    return `<div class="changes-focus"><button class="changes-show-all" data-show-all>${t(
      "changes.showAll"
    )}</button><span class="changes-focus-label">${escapeHtml(label)}</span></div>`;
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

  private renderTreeFile(file: FileChange): string {
    const stat =
      file.added || file.removed
        ? `<span class="ctree-stat"><span class="diff-add-stat">+${file.added}</span><span class="diff-del-stat">−${file.removed}</span></span>`
        : "";
    const isFileLeaf = Boolean(file.taskId);
    const fileKey = file.taskId ? this.key(file.taskId, file.path) : "";
    const fileRow = `<div class="ctree-row ctree-file-row${file.status ? ` change-${file.status}` : ""}"${
      isFileLeaf ? ` data-toggle="${fileKey}"` : ""
    }><span class="ctree-file-icon">${isFileLeaf ? "▸" : "›"}</span><span class="ctree-file-name">${escapeHtml(
      baseName(file.path)
    )}</span>${stat}</div>`;
    const fileDetail = isFileLeaf ? `<div class="ctree-detail hidden" data-detail="${fileKey}"></div>` : "";
    const methods = file.methods
      .map((method) => {
        const key = this.key(method.taskId, file.path);
        return `<div class="ctree-method change-${method.status}" data-toggle="${key}"><span class="ctree-marker">${
          STATUS_MARKER[method.status]
        }</span><span class="ctree-method-name">${escapeHtml(method.label)}</span></div>
        <div class="ctree-detail hidden" data-detail="${key}"></div>`;
      })
      .join("");
    return `<div class="ctree-file">${fileRow}${fileDetail}${methods}</div>`;
  }

  private query<T extends Element>(selector: string): T | null {
    return this.pendingTree.querySelector<T>(selector) ?? this.committedTree.querySelector<T>(selector);
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
    const separator = key.indexOf(KEY_SEPARATOR);
    const taskId = key.slice(0, separator);
    const filePath = key.slice(separator + KEY_SEPARATOR.length);
    const task = this.tasksById.get(taskId);
    if (!task) {
      return;
    }
    detail.innerHTML = this.renderDetail(task, filePath);
    detail.classList.remove("hidden");
  }

  private renderDetail(task: Task, filePath: string): string {
    const files = parseUnifiedDiff(task.diff ?? "").filter((file) => file.path === filePath);
    const hunks = files.flatMap((file) => file.hunks);
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
        ${task.type === "request" ? `<button class="changes-open-chat" data-open-chat="${task.id}">${t("changes.viewTask")}</button>` : ""}
      </div>
      ${signature}
      ${summary}
      ${this.impactBlock(task)}
      <div class="ctree-hunks">${hunks.map((hunk, index) => this.renderHunk(task, filePath, hunk, index)).join("")}</div>
      ${this.messagesBlock(task)}
      <input class="ctree-reply" data-reply-task="${task.id}" placeholder="${t("changes.reply")}" />
      ${actions}`;
  }

  private renderHunk(task: Task, filePath: string, hunk: DiffHunk, index: number): string {
    const askKey = `${task.id}${KEY_SEPARATOR}${filePath}${KEY_SEPARATOR}${index}`;
    const region = `${filePath} ${hunk.header}`;
    const lines = hunk.lines
      .map(
        (line) =>
          `<div class="diff-line diff-${line.kind}">${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}${escapeHtml(
            line.text
          )}</div>`
      )
      .join("");
    return `<div class="ctree-hunk">
      <div class="diff-hunk-head"><span>${escapeHtml(hunk.header)}</span><button class="hunk-ask-btn" data-ask="${askKey}">💬 ${t(
        "changes.ask"
      )}</button></div>
      ${lines}
      <div class="hunk-ask hidden" data-ask-box="${askKey}">
        <input class="hunk-ask-input" data-ask-task="${task.id}" data-ask-region="${escapeHtml(region)}" placeholder="${t(
          "changes.askPlaceholder"
        )}" />
      </div>
    </div>`;
  }

  private toggleAskBox(askKey: string): void {
    const box = this.query<HTMLElement>(`[data-ask-box="${askKey}"]`);
    if (!box) {
      return;
    }
    box.classList.toggle("hidden");
    if (!box.classList.contains("hidden")) {
      box.querySelector<HTMLInputElement>(".hunk-ask-input")?.focus();
    }
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
