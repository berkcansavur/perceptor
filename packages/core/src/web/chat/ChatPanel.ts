import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import type { Task } from "../types";
import { byId, closestEl, escapeHtml } from "../dom";
import { t } from "../i18n";
import { specDescription } from "../taskView";
import { roleLabel } from "./roleLabel";

const REQUEST_TYPE = "request";
const REFRESH_MS = 2000;
const ACTIVITY_MS = 1000;

// The Chat tab: a conversation with Claude. Each send creates a `request` task the
// skill implements; replies continue an existing request. Diffs land in Changes.
export class ChatPanel {
  private readonly thread = byId("chat-thread");
  private lastJson: string | null = null;
  // The request whose prompt is currently being re-edited inline, or null.
  private editingId: string | null = null;
  // Last rendered requests, so an inline edit toggle can re-render synchronously
  // without waiting on a refetch (and losing the click).
  private rendered: Task[] = [];

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
    this.thread.addEventListener("keydown", (event) => {
      const reply = closestEl<HTMLInputElement>(event.target, "[data-chat]");
      if (reply && event.key === "Enter" && reply.value.trim()) {
        void this.reply(reply.dataset.chat ?? "", reply.value.trim());
        reply.value = "";
      }
    });
    this.thread.addEventListener("click", (event) => {
      const view = closestEl<HTMLElement>(event.target, "[data-view-changes]");
      if (view) {
        // ChangesView jumps to the owning tab (Pending if uncommitted, Changes once committed).
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
      const edit = closestEl<HTMLElement>(event.target, "[data-edit]");
      if (edit) {
        this.beginEdit(edit.dataset.edit ?? "");
        return;
      }
      const editCancel = closestEl<HTMLElement>(event.target, "[data-edit-cancel]");
      if (editCancel) {
        this.editingId = null;
        this.render(this.rendered);
        return;
      }
      const editSave = closestEl<HTMLElement>(event.target, "[data-edit-save]");
      if (editSave) {
        void this.saveEdit(editSave.dataset.editSave ?? "");
      }
    });
    this.bus.on("auto:changed", () => void this.refresh(true));

    void this.refresh(true);
    setInterval(() => void this.refresh(), REFRESH_MS);
    setInterval(() => void this.updateActivity(), ACTIVITY_MS);
  }

  // Streams Claude's live "what it's doing now" line under the working request,
  // updated in place so a fast tick never disrupts scroll or the reply box.
  private async updateActivity(): Promise<void> {
    let activities;
    try {
      activities = await this.api.autoActivity();
    } catch {
      return;
    }
    const byTask = new Map(activities.map((item) => [item.taskId, item]));
    for (const node of this.thread.querySelectorAll<HTMLElement>(".chat-activity")) {
      const activity = node.dataset.activityFor ? byTask.get(node.dataset.activityFor) : undefined;
      node.textContent = activity ? `⚙ ${activity.text}` : "";
      node.classList.toggle("hidden", !activity);
    }
  }

  private async send(): Promise<void> {
    const input = byId<HTMLTextAreaElement>("chat-input");
    const text = input.value.trim();
    if (!text) {
      return;
    }
    await this.api.sendRequest(text);
    input.value = "";
    this.autoGrow(input);
    this.bus.emit("toast", t("chat.sent"));
    void this.refresh(true);
  }

  // Grow the composer with its content (capped in CSS) so long messages wrap
  // onto new lines instead of scrolling inside a fixed two-row box.
  private autoGrow(input: HTMLTextAreaElement): void {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }

  private async reply(id: string, message: string): Promise<void> {
    await this.api.updateTask(id, { message, role: "user" });
    void this.refresh(true);
  }

  // Swap the request bubble for an inline editor and focus it. Re-renders from the
  // last fetched list so the toggle is instant; polling won't clobber the open
  // editor because the refresh skips while focus is inside the chat panel.
  private beginEdit(id: string): void {
    this.editingId = id;
    this.render(this.rendered);
    const input = document.querySelector<HTMLTextAreaElement>(`[data-edit-input="${id}"]`);
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  // Rewrite the prompt and re-run cold. Same task id → its accumulated token total
  // carries over; the re-run only adds to it.
  private async saveEdit(id: string): Promise<void> {
    const input = document.querySelector<HTMLTextAreaElement>(`[data-edit-input="${id}"]`);
    const description = input ? input.value.trim() : "";
    if (!description) {
      return;
    }
    this.editingId = null;
    await this.api.editRequest(id, description);
    this.bus.emit("toast", t("chat.edited"));
    void this.refresh(true);
  }

  private async setStatus(id: string, status: string): Promise<void> {
    await this.api.updateTask(id, { status });
    void this.refresh(true);
  }

  // Archive (not delete): hides a resolved request from the chat — the task stays in
  // the queue file, just dismissed — so the thread doesn't pile up.
  private async archive(id: string): Promise<void> {
    await this.api.updateTask(id, { dismissed: true });
    this.bus.emit("toast", t("chat.archived"));
    void this.refresh(true);
  }

  async refresh(force = false): Promise<void> {
    let requests: Task[] = [];
    try {
      requests = (await this.api.tasks()).filter(
        (task) => task.type === REQUEST_TYPE && !task.dismissed
      );
    } catch {
      return;
    }
    void this.renderHint(requests);
    const json = JSON.stringify(requests);
    const isTyping = document.activeElement && document.activeElement.closest("#chat");
    if (!force && (json === this.lastJson || isTyping)) {
      return;
    }
    this.lastJson = json;
    this.render(requests);
  }

  // Reminds the user a queued request needs the Auto-process toggle (above) on, or a
  // /visualise tasks run. Hidden when nothing awaits Claude or Auto-process is already
  // on (the toggle's own status covers that case).
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

  // Resolved/dead requests can be archived; active ones must be approved/rejected first.
  private isResolved(task: Task): boolean {
    return !task.lock && ["applied", "rejected", "error"].includes(task.status);
  }

  private render(requests: Task[]): void {
    this.rendered = requests;
    if (requests.length === 0) {
      this.thread.innerHTML = `<div class="chat-empty muted">${t("chat.empty")}</div>`;
      return;
    }
    this.thread.innerHTML = requests.map((request) => this.renderRequest(request)).join("");
    this.thread.scrollTop = this.thread.scrollHeight;
  }

  private renderRequest(request: Task): string {
    const description = specDescription(request);
    if (this.editingId === request.id) {
      return this.renderEditor(request, description);
    }
    const bubbles = (request.messages ?? [])
      .map(
        (message) =>
          `<div class="chat-msg chat-${message.role}"><b>${escapeHtml(roleLabel(message.role))}:</b> ${escapeHtml(
            message.text
          )}</div>`
      )
      .join("");
    const changesLink = request.diff
      ? `<button class="chat-view-changes" data-view-changes="${request.id}">${t(
          "chat.viewChanges"
        )}</button>`
      : "";
    const actions =
      request.status === "proposed"
        ? `<div class="chat-actions"><button class="primary" data-approve="${request.id}">${t(
            "task.approve"
          )}</button><button data-reject="${request.id}">${t("task.reject")}</button></div>`
        : "";
    const editButton = request.lock
      ? ""
      : `<button class="chat-edit-btn" data-edit="${request.id}" title="${t("chat.edit")}">✎</button>`;
    return `<div class="chat-request" data-id="${request.id}">
      <div class="chat-msg chat-user"><b>${t("chat.you")}:</b> ${escapeHtml(description)}${editButton}</div>
      ${bubbles}
      <div class="chat-meta">
        ${
          request.lock
            ? ""
            : `<span class="status-badge status-${request.status}">${t("status." + request.status)}</span>`
        }
        ${this.liveChip(request)}
        ${changesLink}
        ${this.isResolved(request) ? `<button class="chat-archive" data-archive="${request.id}" title="${t("chat.archive")}">📥</button>` : ""}
      </div>
      <div class="chat-activity hidden" data-activity-for="${request.id}"></div>
      ${actions}
      <input class="chat-reply" data-chat="${request.id}" placeholder="${t("chat.reply")}" />
    </div>`;
  }

  // Inline prompt editor shown in place of the request bubble while editing.
  private renderEditor(request: Task, description: string): string {
    return `<div class="chat-request chat-editing" data-id="${request.id}">
      <textarea class="chat-edit-input" data-edit-input="${request.id}">${escapeHtml(description)}</textarea>
      <div class="chat-edit-actions">
        <button class="primary" data-edit-save="${request.id}">${t("chat.editSave")}</button>
        <button data-edit-cancel="${request.id}">${t("modal.cancel")}</button>
      </div>
    </div>`;
  }

  // Live Claude state for this request: a spinning chip + Stop while Claude actively
  // works it (the task holds a process lock), or a waiting chip while it's queued.
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

  // Interrupt one running request to stop spending tokens (others keep running).
  private async stop(taskId: string): Promise<void> {
    await this.api.stopProcessing(taskId);
    this.bus.emit("toast", t("chat.stopped"));
    void this.refresh(true);
  }
}
