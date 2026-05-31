import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import type { Task, TaskMessage, TaskStatus } from "../types";
import { byId, closestEl, escapeHtml } from "../dom";
import { t } from "../i18n";
import { specDescription } from "../taskView";
import { roleLabel } from "./roleLabel";

const REQUEST_TYPE = "request";
const REFRESH_MS = 2000;
const ACTIVITY_MS = 1000;
const KEY_SEPARATOR = "::";

// The Chat tab, Claude-Desktop style: conversations list on the left, the selected
// conversation's thread + composer on the right. Each conversation is one `request`
// task; the composer sends a reply to the selected one, or — in "new chat" mode —
// starts a fresh request. Every sent message (the prompt and each user reply) carries
// a ✎ to edit it: editing the prompt re-runs the request cold; editing a reply rewrites
// it, drops the later turns, and re-runs from there.
export class ChatPanel {
  private readonly list = byId("chat-list");
  private readonly thread = byId("chat-thread");
  private lastJson: string | null = null;
  private rendered: Task[] = [];
  // The conversation shown on the right, or null in "new chat" mode.
  private selectedId: string | null = null;
  private newChatMode = false;
  // After sending a brand-new request, select whichever conversation is newest.
  private selectNewest = false;
  // The prompt being re-edited inline, or the follow-up message ("id::index"), or null.
  private editingId: string | null = null;
  private editingMessage: string | null = null;

  constructor(
    private readonly api: Api,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    byId("chat-send").addEventListener("click", () => void this.send());
    const input = byId<HTMLTextAreaElement>("chat-input");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.send();
      }
    });
    input.addEventListener("input", () => this.autoGrow(input));
    byId("chat-hint").addEventListener("click", (event) => {
      const copy = closestEl<HTMLElement>(event.target, "[data-copy-cmd]");
      if (copy) {
        void navigator.clipboard.writeText("/visualise tasks");
        copy.textContent = t("tasks.copied");
        setTimeout(() => (copy.textContent = t("tasks.copyCmd")), 1500);
      }
    });
    this.list.addEventListener("click", (event) => this.onListClick(event));
    this.thread.addEventListener("click", (event) => this.onThreadClick(event));
    this.bus.on("auto:changed", () => void this.refresh(true));
    this.bus.on("chat:select", (taskId) => this.select(taskId));

    void this.refresh(true);
    setInterval(() => void this.refresh(), REFRESH_MS);
    setInterval(() => void this.updateActivity(), ACTIVITY_MS);
  }

  private onListClick(event: MouseEvent): void {
    if (closestEl<HTMLElement>(event.target, "[data-new-chat]")) {
      this.startNewChat();
      return;
    }
    const conversationItem = closestEl<HTMLElement>(event.target, "[data-conv]");
    if (conversationItem) {
      this.selectedId = conversationItem.dataset.conv ?? null;
      this.newChatMode = false;
      this.editingId = null;
      this.editingMessage = null;
      this.render(this.rendered);
    }
  }

  // Open a specific conversation from another tab (Tasks / Changes "View in chat").
  private select(taskId: string): void {
    this.selectedId = taskId;
    this.newChatMode = false;
    this.editingId = null;
    this.editingMessage = null;
    this.bus.emit("mode:set", "chat");
    void this.refresh(true);
  }

  private startNewChat(): void {
    this.selectedId = null;
    this.newChatMode = true;
    this.editingId = null;
    this.editingMessage = null;
    this.render(this.rendered);
    byId<HTMLTextAreaElement>("chat-input").focus();
  }

  private onThreadClick(event: MouseEvent): void {
    const view = closestEl<HTMLElement>(event.target, "[data-view-changes]");
    if (view) {
      this.bus.emit("changes:focus", view.dataset.viewChanges ?? null);
      return;
    }
    const approve = closestEl<HTMLElement>(event.target, "[data-approve]");
    if (approve) {
      void this.setStatus(approve.dataset.approve ?? "", "approved");
      return;
    }
    const reject = closestEl<HTMLElement>(event.target, "[data-reject]");
    if (reject) {
      void this.setStatus(reject.dataset.reject ?? "", "rejected");
      return;
    }
    const archive = closestEl<HTMLElement>(event.target, "[data-archive]");
    if (archive) {
      void this.archive(archive.dataset.archive ?? "");
      return;
    }
    const stopEl = closestEl<HTMLElement>(event.target, "[data-stop]");
    if (stopEl) {
      void this.stop(stopEl.dataset.stop ?? "");
      return;
    }
    if (this.onEditClick(event)) {
      return;
    }
  }

  // The ✎ / save / cancel controls shared by the prompt and each follow-up message.
  private onEditClick(event: MouseEvent): boolean {
    const edit = closestEl<HTMLElement>(event.target, "[data-edit]");
    if (edit) {
      this.beginEdit(edit.dataset.edit ?? "");
      return true;
    }
    const editMessage = closestEl<HTMLElement>(event.target, "[data-edit-msg]");
    if (editMessage) {
      this.beginEditMessage(editMessage.dataset.editMsg ?? "");
      return true;
    }
    if (closestEl<HTMLElement>(event.target, "[data-edit-cancel]")) {
      this.editingId = null;
      this.editingMessage = null;
      this.render(this.rendered);
      return true;
    }
    const save = closestEl<HTMLElement>(event.target, "[data-edit-save]");
    if (save) {
      void this.saveEdit(save.dataset.editSave ?? "");
      return true;
    }
    const saveMessage = closestEl<HTMLElement>(event.target, "[data-edit-msg-save]");
    if (saveMessage) {
      void this.saveEditMessage(saveMessage.dataset.editMsgSave ?? "");
      return true;
    }
    return false;
  }

  private async updateActivity(): Promise<void> {
    let activities;
    try {
      activities = await this.api.autoActivity();
    } catch {
      return;
    }
    const byTask = new Map(activities.map((activity) => [activity.taskId, activity]));
    for (const activityElement of this.thread.querySelectorAll<HTMLElement>(".chat-activity")) {
      const activity = activityElement.dataset.activityFor ? byTask.get(activityElement.dataset.activityFor) : undefined;
      activityElement.textContent = activity ? `⚙ ${activity.text}` : "";
      activityElement.classList.toggle("hidden", !activity);
    }
  }

  // Send the composer: a reply to the selected conversation, or a brand-new request
  // when none is selected (new-chat mode).
  private async send(): Promise<void> {
    const input = byId<HTMLTextAreaElement>("chat-input");
    const text = input.value.trim();
    if (!text) {
      return;
    }
    input.value = "";
    this.autoGrow(input);
    if (this.selectedId) {
      await this.api.replyToTask(this.selectedId, text);
    } else {
      this.selectNewest = true;
      await this.api.sendRequest(text);
      this.bus.emit("toast", t("chat.sent"));
    }
    void this.refresh(true);
  }

  // Grow the composer with its content (capped in CSS) so long messages wrap.
  private autoGrow(input: HTMLTextAreaElement): void {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }

  private beginEdit(id: string): void {
    this.editingId = id;
    this.editingMessage = null;
    this.render(this.rendered);
    this.focusEditor(`[data-edit-input="${id}"]`);
  }

  private beginEditMessage(key: string): void {
    this.editingMessage = key;
    this.editingId = null;
    this.render(this.rendered);
    this.focusEditor(`[data-edit-input="${key}"]`);
  }

  private focusEditor(selector: string): void {
    const input = document.querySelector<HTMLTextAreaElement>(selector);
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  // Rewrite the prompt and re-run cold. Same task id → its token total carries over.
  private async saveEdit(id: string): Promise<void> {
    const description = this.editorValue(`[data-edit-input="${id}"]`);
    if (!description) {
      return;
    }
    this.editingId = null;
    await this.api.editRequest(id, description);
    this.bus.emit("toast", t("chat.edited"));
    void this.refresh(true);
  }

  // Rewrite a follow-up message and re-run from that point (later turns dropped).
  private async saveEditMessage(key: string): Promise<void> {
    const text = this.editorValue(`[data-edit-input="${key}"]`);
    if (!text) {
      return;
    }
    const { id, index } = this.splitKey(key);
    this.editingMessage = null;
    await this.api.editMessage(id, index, text);
    this.bus.emit("toast", t("chat.edited"));
    void this.refresh(true);
  }

  private editorValue(selector: string): string {
    const input = document.querySelector<HTMLTextAreaElement>(selector);
    return input ? input.value.trim() : "";
  }

  private async setStatus(id: string, status: TaskStatus): Promise<void> {
    await this.api.setTaskStatus(id, status);
    void this.refresh(true);
  }

  private async archive(id: string): Promise<void> {
    await this.api.archiveTask(id);
    if (this.selectedId === id) {
      this.selectedId = null;
    }
    this.bus.emit("toast", t("chat.archived"));
    void this.refresh(true);
  }

  async refresh(force = false): Promise<void> {
    let all: Task[] = [];
    try {
      all = await this.api.tasks();
    } catch {
      return;
    }
    const requests = this.conversations(all);
    this.resolveSelection(requests);
    void this.renderHint(requests);
    const json = `${JSON.stringify(requests)}|${this.selectedId ?? ""}|${this.newChatMode}`;
    const isTyping = document.activeElement && document.activeElement.closest("#chat");
    if (!force && (json === this.lastJson || isTyping)) {
      return;
    }
    this.lastJson = json;
    this.render(requests);
  }

  // Every task that reads as a conversation: a free-form request, or any other task type
  // Claude has actually talked on (has messages) — e.g. an add-behavior. describe-behavior
  // is internal and stays hidden. The selected task is always kept so a "View in chat"
  // jump from Tasks/Changes lands on it even before it has any messages.
  private conversations(all: Task[]): Task[] {
    const list = all.filter(
      (task) =>
        !task.dismissed &&
        task.type !== "describe-behavior" &&
        (task.type === REQUEST_TYPE || (task.messages?.length ?? 0) > 0)
    );
    if (this.selectedId && !list.some((task) => task.id === this.selectedId)) {
      const selected = all.find((task) => task.id === this.selectedId && !task.dismissed);
      if (selected) {
        list.push(selected);
      }
    }
    return list;
  }

  // Keep `selectedId` pointing at a live conversation: adopt the newest after a fresh
  // send, drop a vanished one, and auto-open the most recent unless the user chose
  // new-chat mode.
  private resolveSelection(requests: Task[]): void {
    const newest = [...requests].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0] ?? null;
    if (this.selectNewest && newest) {
      this.selectedId = newest.id;
      this.newChatMode = false;
      this.selectNewest = false;
    }
    if (this.selectedId && !requests.some((task) => task.id === this.selectedId)) {
      this.selectedId = null;
    }
    if (!this.selectedId && !this.newChatMode && newest) {
      this.selectedId = newest.id;
    }
  }

  private render(requests: Task[]): void {
    this.rendered = requests;
    this.renderList(requests);
    const selected = requests.find((task) => task.id === this.selectedId) ?? null;
    if (!selected) {
      this.thread.innerHTML = `<div class="chat-empty muted">${t(requests.length ? "chat.noConversation" : "chat.empty")}</div>`;
      return;
    }
    this.thread.innerHTML = this.renderThread(selected);
    this.thread.scrollTop = this.thread.scrollHeight;
  }

  private renderList(requests: Task[]): void {
    const items = [...requests]
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .map((request) => this.renderListItem(request))
      .join("");
    this.list.innerHTML = `<button class="conv-new" data-new-chat>＋ ${t("chat.newChat")}</button>${items}`;
  }

  private renderListItem(request: Task): string {
    const title = specDescription(request) || t("changes.untitled");
    const active = request.id === this.selectedId ? " active" : "";
    return `<button class="conv-item${active}" data-conv="${request.id}">
      <span class="conv-title">${escapeHtml(title)}</span>
      <span class="conv-meta">${this.listMeta(request)}</span>
    </button>`;
  }

  private listMeta(request: Task): string {
    if (request.lock) {
      return `<span class="processing-chip">⚙ ${t("chat.working")}</span>`;
    }
    if (this.awaitsClaude(request)) {
      return `<span class="awaiting-chip">⏳ ${t("chat.awaiting")}</span>`;
    }
    return `<span class="status-badge status-${request.status}">${t("status." + request.status)}</span>`;
  }

  private async renderHint(requests: Task[]): Promise<void> {
    const hint = byId("chat-hint");
    if (!requests.some((request) => this.awaitsClaude(request))) {
      hint.classList.add("hidden");
      return;
    }
    let status;
    try {
      status = await this.api.autoStatus();
    } catch {
      return;
    }
    if (status.enabled) {
      hint.classList.add("hidden");
      return;
    }
    hint.classList.remove("hidden");
    const copyButton = `<button data-copy-cmd>${t("tasks.copyCmd")}</button>`;
    const text = status.available ? t("chat.autoOff") : t("chat.waitingCli");
    hint.innerHTML = `⏳ <span>${text}</span> ${copyButton}`;
  }

  private awaitsClaude(task: Task): boolean {
    if (task.status === "pending" || task.status === "approved") {
      return true;
    }
    const messages = task.messages ?? [];
    const last = messages[messages.length - 1];
    return Boolean(last && last.role === "user");
  }

  private isResolved(task: Task): boolean {
    return !task.lock && ["applied", "rejected", "error"].includes(task.status);
  }

  private renderThread(request: Task): string {
    const description = specDescription(request);
    const prompt =
      this.editingId === request.id
        ? this.renderEditor(`${request.id}`, description, "data-edit-save")
        : `<div class="chat-msg chat-user"><b>${t("chat.you")}:</b> ${escapeHtml(description)}${this.editButton(
            request,
            "data-edit",
            request.id
          )}</div>`;
    const bubbles = (request.messages ?? []).map((message, index) => this.renderBubble(request, message, index)).join("");
    const changesLink = request.artifact.kind !== "none"
      ? `<button class="chat-view-changes" data-view-changes="${request.id}">${t("chat.viewChanges")}</button>`
      : "";
    const actions =
      request.status === "proposed"
        ? `<div class="chat-actions"><button class="primary" data-approve="${request.id}">${t(
            "task.approve"
          )}</button><button data-reject="${request.id}">${t("task.reject")}</button></div>`
        : "";
    return `<div class="chat-request" data-id="${request.id}">
      ${prompt}
      ${bubbles}
      <div class="chat-meta">
        ${request.lock ? "" : `<span class="status-badge status-${request.status}">${t("status." + request.status)}</span>`}
        ${this.liveChip(request)}
        ${changesLink}
        ${this.isResolved(request) ? `<button class="chat-archive" data-archive="${request.id}" title="${t("chat.archive")}">📥</button>` : ""}
      </div>
      <div class="chat-activity hidden" data-activity-for="${request.id}"></div>
      ${actions}
    </div>`;
  }

  private renderBubble(request: Task, message: TaskMessage, index: number): string {
    const key = `${request.id}${KEY_SEPARATOR}${index}`;
    if (message.role === "user" && this.editingMessage === key) {
      return this.renderEditor(key, message.text, "data-edit-msg-save");
    }
    const edit = message.role === "user" ? this.editButton(request, "data-edit-msg", key) : "";
    return `<div class="chat-msg chat-${message.role}"><b>${escapeHtml(roleLabel(message.role))}:</b> ${escapeHtml(
      message.text
    )}${edit}</div>`;
  }

  // The ✎ affordance, hidden only while Claude actively holds the task (a re-run mid-
  // flight would race the running process).
  private editButton(request: Task, attribute: string, value: string): string {
    if (request.lock) {
      return "";
    }
    const title = attribute === "data-edit" ? t("chat.edit") : t("chat.editMessage");
    return `<button class="chat-edit-btn" ${attribute}="${value}" title="${title}">✎</button>`;
  }

  private renderEditor(key: string, text: string, saveAttribute: string): string {
    return `<div class="chat-editing">
      <textarea class="chat-edit-input" data-edit-input="${key}">${escapeHtml(text)}</textarea>
      <div class="chat-edit-actions">
        <button class="primary" ${saveAttribute}="${key}">${t("chat.editSave")}</button>
        <button data-edit-cancel>${t("modal.cancel")}</button>
      </div>
    </div>`;
  }

  private liveChip(request: Task): string {
    if (request.lock) {
      return `<span class="processing-chip">⚙ ${t("chat.working")}</span><button class="stop-btn" data-stop="${request.id}" title="${t(
        "chat.stop"
      )}">⏹ ${t("chat.stop")}</button>`;
    }
    if (this.awaitsClaude(request)) {
      return `<span class="awaiting-chip">⏳ ${t("chat.awaiting")}</span>`;
    }
    return "";
  }

  private splitKey(key: string): { id: string; index: number } {
    const separator = key.indexOf(KEY_SEPARATOR);
    return { id: key.slice(0, separator), index: Number(key.slice(separator + KEY_SEPARATOR.length)) };
  }

  private async stop(taskId: string): Promise<void> {
    await this.api.stopProcessing(taskId);
    this.bus.emit("toast", t("chat.stopped"));
    void this.refresh(true);
  }
}
