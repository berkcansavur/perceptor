import type { ApiClient } from "../api/ApiClient";
import type { Emitter } from "../events";
import type { Task } from "../types";
import { byId, closestEl, escapeHtml } from "../dom";
import { t } from "../i18n";

// The Tasks drawer: renders the queue, polls for changes, and handles
// approve/reject/cancel/dismiss/chat + drag-to-move enqueue.
export class TasksPanel {
  private readonly drawer = byId("tasks-drawer");
  private readonly list = byId("tasks-list");
  private lastTasksJson: string | null = null;

  constructor(
    private readonly api: ApiClient,
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
        void this.update(chat.dataset.chat ?? "", { message: chat.value.trim(), role: "user" });
        chat.value = "";
      }
    });

    void this.refresh(true);
    setInterval(() => void this.refresh(), 3000);
  }

  open(): void {
    this.drawer.classList.remove("hidden");
    void this.refresh(true);
  }

  private close(): void {
    this.drawer.classList.add("hidden");
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

  private async update(id: string, payload: Record<string, unknown>): Promise<void> {
    await this.api.updateTask(id, payload);
    void this.refresh(true);
  }

  private async remove(id: string): Promise<void> {
    await this.api.deleteTask(id);
    void this.refresh(true);
  }

  private onListClick(event: MouseEvent): void {
    const dismiss = closestEl<HTMLElement>(event.target, "[data-dismiss]");
    if (dismiss) {
      void this.update(dismiss.dataset.dismiss ?? "", { dismissed: true });
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
      void this.update(approve.dataset.approve ?? "", { status: "approved" });
    }
    if (reject) {
      void this.update(reject.dataset.reject ?? "", { status: "rejected" });
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
    tasks = tasks.filter((task) => !task.dismissed);
    const active = tasks.filter((task) => task.status !== "applied" && task.status !== "rejected");
    byId("tasks-count").textContent = String(active.length);

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
    const impact =
      task.impact && (task.impact.notes ?? []).length
        ? `<div class="task-impact risk-${task.impact.risk ?? "low"}">
            <div class="impact-head"><span class="risk-dot"></span><span class="impact-title">${t(
              "impact.title"
            )}</span><span class="risk-label">${t("risk." + (task.impact.risk ?? "low"))}</span></div>
            <ul class="impact-notes">${(task.impact.notes ?? [])
              .map((note) => `<li>${escapeHtml(note)}</li>`)
              .join("")}</ul>
          </div>`
        : "";
    const diff = task.diff ? `<pre class="task-diff">${escapeHtml(task.diff)}</pre>` : "";
    const actions =
      task.status === "proposed"
        ? `<div class="task-actions"><button class="primary" data-approve="${task.id}">${t(
            "task.approve"
          )}</button><button data-reject="${task.id}">${t("task.reject")}</button></div>`
        : "";
    const commit = task.commitMessage
      ? `<div class="task-commit"><div class="task-commit-head"><span>${t(
          "commit.title"
        )}</span><button class="commit-copy" data-copy="${task.id}">${t(
          "commit.copy"
        )}</button></div><pre class="task-commit-msg" data-commit="${task.id}">${escapeHtml(
          task.commitMessage
        )}</pre></div>`
      : "";

    let title: string;
    let detail = "";
    if (task.type === "add-behavior") {
      const name = task.spec && task.spec.name ? `${task.spec.name}()` : t("task.add");
      title = `<span class="task-add">＋ ${escapeHtml(name)}</span> <span class="muted">${t(
        "task.in"
      )} ${escapeHtml(task.from.class)}</span>`;
      if (task.spec && task.spec.description) {
        const errorHandling = task.spec.errorHandling;
        const errorLine =
          errorHandling && errorHandling.mode === "throw"
            ? `<div class="task-err">${t("task.onFailure")}: throw ${escapeHtml(
                errorHandling.exception || "Exception"
              )}</div>`
            : errorHandling && errorHandling.mode === "nullable"
            ? `<div class="task-err">${t("task.onFailure")}: return null/undefined</div>`
            : "";
        detail = `<div class="task-desc">${escapeHtml(task.spec.description)}${errorLine}</div>`;
      }
    } else if (task.type === "edit-behavior") {
      title = `<span class="task-edit">✎ ${escapeHtml(task.from.behavior)}()</span> <span class="muted">${t(
        "task.in"
      )} ${escapeHtml(task.from.class)}</span>`;
      if (task.spec && task.spec.description) {
        detail = `<div class="task-desc">${escapeHtml(task.spec.description)}</div>`;
      }
    } else if (task.type === "create-file" || task.type === "create-folder") {
      const label = task.type === "create-file" ? t("create.file") : t("create.folder");
      title = `<span class="task-add">＋ ${escapeHtml(
        (task.spec && task.spec.name) || ""
      )}</span> <span class="muted">${label} ${t("create.in")} ${escapeHtml(
        (task.from && task.from.dir) || "/"
      )}</span>`;
      if (task.spec && task.spec.description) {
        detail = `<div class="task-desc">${escapeHtml(task.spec.description)}</div>`;
      }
    } else {
      title = `${escapeHtml(task.from.behavior)}() <span class="muted">${escapeHtml(
        task.from.class
      )} → ${escapeHtml(task.to.class)}</span>`;
    }

    const isDone = task.status === "applied" || task.status === "rejected";
    return `<div class="task-card${isDone ? " task-done collapsed" : ""}" data-id="${task.id}">
      <div class="task-head">
        <span class="status-badge status-${task.status}">${t("status." + task.status)}</span>
        ${
          task.lock
            ? `<span class="processing-chip">⚙ ${t("task.processing")}</span>`
            : this.awaitsClaude(task)
            ? `<span class="awaiting-chip">⏳ ${t("task.awaiting")}</span>`
            : ""
        }
        <span class="task-title">${title}</span>
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
        <input class="task-chat" data-chat="${task.id}" placeholder="${t("task.chat")}" />
      </div>
    </div>`;
  }
}
