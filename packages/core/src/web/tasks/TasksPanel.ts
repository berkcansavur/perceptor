import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import type { Task, TaskStatus } from "../types";
import { byId, closestEl, escapeHtml } from "../dom";
import { t } from "../i18n";
import { usageBadge } from "../usageBadge";
import { fromBehavior, fromClass, fromDir, specDescription, specName, toClass } from "../taskView";

// The Tasks drawer: renders the queue, polls for changes, and handles
// approve/reject/cancel/dismiss/chat + drag-to-move enqueue.
export class TasksPanel {
  private readonly drawer = byId("tasks-drawer");
  private readonly list = byId("tasks-list");
  private lastTasksJson: string | null = null;

  constructor(
    private readonly api: Api,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    this.bus.on("tasks:open", () => this.open());
    this.bus.on("tasks:refresh", () => void this.refresh(true));
    this.bus.on("task:move", ({ from, to }) => void this.enqueueMove(from, to));

    byId("tasks-btn").addEventListener("click", () => this.open());
    byId("tasks-close").addEventListener("click", () => this.close());
    byId("tasks-waiting").addEventListener("click", (event) => {
      const copy = closestEl<HTMLElement>(event.target, "#copy-cmd");
      if (!copy) {
        return;
      }
      void navigator.clipboard.writeText("/visualise tasks");
      copy.textContent = t("tasks.copied");
      setTimeout(() => (copy.textContent = t("tasks.copyCmd")), 1500);
    });

    this.list.addEventListener("click", (event) => this.onListClick(event));
    this.list.addEventListener("keydown", (event) => {
      const chat = closestEl<HTMLInputElement>(event.target, "[data-chat]");
      if (chat && event.key === "Enter" && chat.value.trim()) {
        void this.reply(chat.dataset.chat ?? "", chat.value.trim());
        chat.value = "";
      }
    });

    void this.refresh(true);
    setInterval(() => void this.refresh(), 3000);
    setInterval(() => void this.updateActivity(), 1000);
  }

  // Mirrors the Chat tab: streams Claude's live "what it's doing now" line under the
  // task currently being processed, updated in place so polling never disrupts typing.
  private async updateActivity(): Promise<void> {
    let activities;
    try {
      activities = await this.api.autoActivity();
    } catch {
      return;
    }
    const byTask = new Map(activities.map((item) => [item.taskId, item]));
    for (const node of this.list.querySelectorAll<HTMLElement>(".task-activity")) {
      const activity = node.dataset.activityFor ? byTask.get(node.dataset.activityFor) : undefined;
      node.textContent = activity ? `⚙ ${activity.text}` : "";
      node.classList.toggle("hidden", !activity);
    }
  }

  open(): void {
    this.drawer.classList.remove("hidden");
    document.body.classList.add("tasks-open");
    void this.refresh(true);
  }

  private close(): void {
    this.drawer.classList.add("hidden");
    document.body.classList.remove("tasks-open");
  }

  private async enqueueMove(
    from: { class: string; file: string; behavior: string },
    to: { class: string; file: string }
  ): Promise<void> {
    await this.api.enqueueTask({ type: "move-behavior", from, to });
    this.bus.emit("toast", t("toast.taskMove", { behavior: from.behavior, from: from.class, to: to.class }));
    void this.refresh(true);
    this.open();
  }

  private async reply(id: string, message: string): Promise<void> {
    await this.api.replyToTask(id, message);
    void this.refresh(true);
  }

  private async archive(id: string): Promise<void> {
    await this.api.archiveTask(id);
    void this.refresh(true);
  }

  private async changeStatus(id: string, status: TaskStatus): Promise<void> {
    await this.api.setTaskStatus(id, status);
    void this.refresh(true);
  }

  // Interrupt one running task to stop spending tokens (others keep running).
  private async stop(taskId: string): Promise<void> {
    await this.api.stopProcessing(taskId);
    this.bus.emit("toast", t("chat.stopped"));
    void this.refresh(true);
  }

  private async remove(id: string): Promise<void> {
    await this.api.deleteTask(id);
    void this.refresh(true);
  }

  private onListClick(event: MouseEvent): void {
    const viewChat = closestEl<HTMLElement>(event.target, "[data-view-chat]");
    if (viewChat) {
      this.bus.emit("chat:select", viewChat.dataset.viewChat ?? "");
      return;
    }
    const stopEl = closestEl<HTMLElement>(event.target, "[data-stop]");
    if (stopEl) {
      void this.stop(stopEl.dataset.stop ?? "");
      return;
    }
    const dismiss = closestEl<HTMLElement>(event.target, "[data-dismiss]");
    if (dismiss) {
      void this.archive(dismiss.dataset.dismiss ?? "");
      return;
    }
    const cancel = closestEl<HTMLElement>(event.target, "[data-cancel]");
    if (cancel) {
      void this.remove(cancel.dataset.cancel ?? "");
      return;
    }
    const doneHead = closestEl<HTMLElement>(event.target, ".task-done > .task-head");
    if (doneHead && doneHead.parentElement) {
      doneHead.parentElement.classList.toggle("collapsed");
      return;
    }
    const approve = closestEl<HTMLElement>(event.target, "[data-approve]");
    const reject = closestEl<HTMLElement>(event.target, "[data-reject]");
    const copy = closestEl<HTMLElement>(event.target, "[data-copy]");
    if (approve) {
      void this.changeStatus(approve.dataset.approve ?? "", "approved");
    }
    if (reject) {
      void this.changeStatus(reject.dataset.reject ?? "", "rejected");
    }
    if (copy) {
      const pre = this.list.querySelector<HTMLElement>(`.task-commit-msg[data-commit="${copy.dataset.copy}"]`);
      if (pre) {
        void navigator.clipboard.writeText(pre.textContent ?? "");
        copy.textContent = t("commit.copied");
        setTimeout(() => (copy.textContent = t("commit.copy")), 1500);
      }
    }
  }

  private awaitsClaude(task: Task): boolean {
    if (task.status === "pending" || task.status === "approved") {
      return true;
    }
    const messages = task.messages ?? [];
    const last = messages[messages.length - 1];
    return Boolean(last && last.role === "user");
  }

  async refresh(force = false): Promise<void> {
    let tasks: Task[] = [];
    try {
      tasks = await this.api.tasks();
    } catch {
      return;
    }
    // Tasks is Claude's live work queue: only what's running now (holds a process
    // lock) or waiting on Claude (pending/approved, or a reply it hasn't answered).
    // Finished work — applied, proposed-for-review, rejected — leaves the tab; those
    // are reviewed from the chat request's "View changes", not here.
    tasks = tasks.filter(
      (task) =>
        !task.dismissed &&
        task.type !== "describe-behavior" &&
        (Boolean(task.lock) || this.awaitsClaude(task))
    );
    byId("tasks-count").textContent = String(tasks.length);

    const waiting = tasks.filter((task) => this.awaitsClaude(task)).length;
    byId("tasks-btn").classList.toggle("attention", waiting > 0);
    const banner = byId("tasks-waiting");
    if (waiting > 0) {
      banner.classList.remove("hidden");
      banner.innerHTML = `⏳ <span>${t("tasks.waiting", { n: waiting })}</span> <button id="copy-cmd">${t(
        "tasks.copyCmd"
      )}</button>`;
    } else {
      banner.classList.add("hidden");
    }

    const json = JSON.stringify(tasks);
    const isTypingInDrawer = document.activeElement && document.activeElement.closest("#tasks-list");
    if (!force && (json === this.lastTasksJson || isTypingInDrawer)) {
      return;
    }
    this.lastTasksJson = json;
    this.render(tasks);
  }

  private render(tasks: Task[]): void {
    if (tasks.length === 0) {
      this.list.innerHTML = `<div class="tasks-empty muted">${t("tasks.empty")}</div>`;
      return;
    }
    this.list.innerHTML = tasks
      .slice()
      .reverse()
      .map((task) => this.renderCard(task))
      .join("");
  }

  private renderCard(task: Task): string {
    const messages = (task.messages ?? [])
      .map(
        (message) =>
          `<div class="msg msg-${message.role}"><b>${message.role}:</b> ${escapeHtml(message.text)}</div>`
      )
      .join("");
    const artifact = task.artifact;
    const impactReport = artifact.kind === "none" ? null : artifact.impact;
    const impact =
      impactReport && impactReport.notes.length
        ? `<div class="task-impact risk-${impactReport.risk || "low"}">
            <div class="impact-head"><span class="risk-dot"></span><span class="impact-title">${t(
              "impact.title"
            )}</span><span class="risk-label">${t("risk." + (impactReport.risk || "low"))}</span></div>
            <ul class="impact-notes">${impactReport.notes
              .map((note) => `<li>${escapeHtml(note)}</li>`)
              .join("")}</ul>
          </div>`
        : "";
    const diffText = artifact.kind === "none" ? "" : artifact.diff;
    const diff = diffText ? `<pre class="task-diff">${escapeHtml(diffText)}</pre>` : "";
    const actions =
      task.status === "proposed"
        ? `<div class="task-actions"><button class="primary" data-approve="${task.id}">${t(
            "task.approve"
          )}</button><button data-reject="${task.id}">${t("task.reject")}</button></div>`
        : "";
    const commitMessage = artifact.kind === "applied" ? artifact.commitMessage : "";
    const commit = commitMessage
      ? `<div class="task-commit"><div class="task-commit-head"><span>${t(
          "commit.title"
        )}</span><button class="commit-copy" data-copy="${task.id}">${t(
          "commit.copy"
        )}</button></div><pre class="task-commit-msg" data-commit="${task.id}">${escapeHtml(
          commitMessage
        )}</pre></div>`
      : "";

    let title: string;
    let detail = "";
    const description = specDescription(task);
    if (task.type === "add-behavior") {
      const name = task.spec.name ? `${task.spec.name}()` : t("task.add");
      title = `<span class="task-add">＋ ${escapeHtml(name)}</span> <span class="muted">${t(
        "task.in"
      )} ${escapeHtml(fromClass(task))}</span>`;
      if (description) {
        const errorHandling = task.spec.errorHandling;
        const errorLine =
          errorHandling.mode === "throw"
            ? `<div class="task-err">${t("task.onFailure")}: throw ${escapeHtml(
                errorHandling.exception || "Exception"
              )}</div>`
            : errorHandling.mode === "nullable"
            ? `<div class="task-err">${t("task.onFailure")}: return null/undefined</div>`
            : "";
        detail = `<div class="task-desc">${escapeHtml(description)}${errorLine}</div>`;
      }
    } else if (task.type === "edit-behavior") {
      title = `<span class="task-edit">✎ ${escapeHtml(fromBehavior(task))}()</span> <span class="muted">${t(
        "task.in"
      )} ${escapeHtml(fromClass(task))}</span>`;
      if (description) {
        detail = `<div class="task-desc">${escapeHtml(description)}</div>`;
      }
    } else if (task.type === "create-file" || task.type === "create-folder") {
      const label = task.type === "create-file" ? t("create.file") : t("create.folder");
      title = `<span class="task-add">＋ ${escapeHtml(specName(task))}</span> <span class="muted">${label} ${t(
        "create.in"
      )} ${escapeHtml(fromDir(task) || "/")}</span>`;
      if (description) {
        detail = `<div class="task-desc">${escapeHtml(description)}</div>`;
      }
    } else if (task.type === "request") {
      title = `<span class="task-edit">✦ ${t("changes.request")}</span>`;
      if (description) {
        detail = `<div class="task-desc">${escapeHtml(description)}</div>`;
      }
    } else {
      title = `${escapeHtml(fromBehavior(task))}() <span class="muted">${escapeHtml(
        fromClass(task)
      )} → ${escapeHtml(toClass(task))}</span>`;
    }

    const isDone = task.status === "applied" || task.status === "rejected";
    return `<div class="task-card${isDone ? " task-done collapsed" : ""}" data-id="${task.id}">
      <div class="task-head">
        <span class="status-badge status-${task.status}">${t("status." + task.status)}</span>
        ${
          task.lock
            ? `<span class="processing-chip">⚙ ${t("task.processing")}</span><button class="stop-btn" data-stop="${task.id}" title="${t(
                "chat.stop"
              )}">⏹ ${t("chat.stop")}</button>`
            : this.awaitsClaude(task)
            ? `<span class="awaiting-chip">⏳ ${t("task.awaiting")}</span>`
            : ""
        }
        <span class="task-title">${title}</span>
        ${usageBadge(task.usage)}
        <button class="task-viewchat" data-view-chat="${task.id}" title="${t("tasks.viewInChat")}">💬</button>
        ${
          isDone
            ? `<button class="task-dismiss" data-dismiss="${task.id}" title="${t("task.dismiss")}">×</button>`
            : `<button class="task-dismiss" data-cancel="${task.id}" title="${t("task.cancel")}">×</button>`
        }
      </div>
      <div class="task-body">
        ${detail}
        ${impact}
        ${diff}
        ${commit}
        ${actions}
        <div class="task-messages">${messages}</div>
        <div class="task-activity chat-activity hidden" data-activity-for="${task.id}"></div>
        <input class="task-chat" data-chat="${task.id}" placeholder="${t("task.chat")}" />
      </div>
    </div>`;
  }
}
