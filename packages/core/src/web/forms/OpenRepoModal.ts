import type { Api } from "../api/ApiClient";
import type { AppState } from "../state/AppState";
import type { Emitter } from "../Emitter";
import { byId, closestEl, escapeHtml } from "../dom";
import { errorMessage } from "../errors";
import { t } from "../i18n";

const RECENT_KEY = "perceptorRecent";

// "Open repository" dialog: a navigable folder browser + recent list (VS Code
// "Open Folder" equivalent).
export class OpenRepoModal {
  private readonly modal = byId("open-modal");
  private readonly input = byId<HTMLInputElement>("open-path");
  private readonly error = byId("open-error");
  private readonly browseList = byId("browse-list");
  private readonly browsePathLabel = byId("browse-path");
  private readonly browseUp = byId<HTMLButtonElement>("browse-up");
  private currentParent: string | null = null;

  constructor(
    private readonly api: Api,
    private readonly state: AppState,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    this.api
      .meta()
      .then((meta) => {
        this.setRepoName(meta.root);
        this.state.hostRoot = meta.hostRoot ?? meta.root;
        this.rememberRecent(meta.root);
      })
      .catch(() => {});

    byId("open-repo").addEventListener("click", () => this.open());
    byId("open-cancel").addEventListener("click", () => this.close());
    byId("open-confirm").addEventListener("click", () => void this.openRepo(this.input.value.trim()));
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        void this.openRepo(this.input.value.trim());
      }
      if (event.key === "Escape") {
        this.close();
      }
    });
    this.browseUp.addEventListener("click", () => {
      if (this.currentParent) {
        void this.loadBrowse(this.currentParent);
      }
    });
    this.browseList.addEventListener("click", (event) => {
      const openButton = closestEl<HTMLElement>(event.target, "[data-open]");
      if (openButton) {
        void this.openRepo(openButton.dataset.open ?? "");
        return;
      }
      const browseItem = closestEl<HTMLElement>(event.target, ".browse-item");
      if (browseItem) {
        void this.loadBrowse(browseItem.dataset.path ?? null);
      }
    });
    this.modal.addEventListener("mousedown", (event) => {
      if (event.target === this.modal) {
        this.close();
      }
    });
    byId("recent-list").addEventListener("click", (event) => {
      const recentItem = closestEl<HTMLElement>(event.target, ".recent-item");
      if (recentItem) {
        void this.openRepo(recentItem.dataset.path ?? "");
      }
    });
  }

  private basename(repoPath: string): string {
    return repoPath.replace(/\/+$/, "").split("/").pop() || repoPath;
  }

  private setRepoName(root: string): void {
    const element = byId("repo-name");
    element.textContent = this.basename(root);
    element.title = root;
  }

  private loadRecent(): string[] {
    try {
      return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]) || [];
    } catch {
      return [];
    }
  }

  private rememberRecent(root: string): void {
    const recent = [root, ...this.loadRecent().filter((item) => item !== root)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  }

  private renderRecent(): void {
    const recent = this.loadRecent();
    const list = byId("recent-list");
    byId("recent-label").classList.toggle("hidden", recent.length === 0);
    list.innerHTML = recent
      .map(
        (item) =>
          `<div class="recent-item" data-path="${item.replace(/"/g, "&quot;")}"><span class="recent-name">${this.basename(
            item
          )}</span><span class="recent-path">${item}</span></div>`
      )
      .join("");
  }

  private async loadBrowse(targetPath: string | null): Promise<void> {
    let data;
    try {
      data = await this.api.browse(targetPath);
    } catch {
      return;
    }
    this.currentParent = data.parent;
    this.browsePathLabel.textContent = data.path;
    this.input.value = data.path;
    this.browseUp.disabled = !data.parent;
    this.browseList.innerHTML = data.entries.length
      ? data.entries
          .map(
            (entry) =>
              `<div class="browse-item" data-path="${entry.path.replace(/"/g, "&quot;")}">
                <span class="browse-name">📁 ${escapeHtml(entry.name)}</span>
                <button class="browse-open" data-open="${entry.path.replace(/"/g, "&quot;")}">${t(
                "open.confirm"
              )}</button>
              </div>`
          )
          .join("")
      : `<div class="browse-empty muted">${t("open.empty")}</div>`;
  }

  private open(): void {
    this.error.classList.add("hidden");
    this.renderRecent();
    this.modal.classList.remove("hidden");
    const current = byId("repo-name").title || "";
    const startAt = current.replace(/\/[^/]+\/?$/, "");
    void this.loadBrowse(startAt || null);
  }

  private close(): void {
    this.modal.classList.add("hidden");
  }

  private async openRepo(target: string): Promise<void> {
    if (!target) {
      return;
    }
    this.bus.emit("toast", t("toast.opening"));
    let result: { root: string; hostRoot: string };
    try {
      result = await this.api.open(target);
    } catch (error) {
      this.error.textContent = errorMessage(error);
      this.error.classList.remove("hidden");
      return;
    }
    this.setRepoName(result.root);
    this.state.hostRoot = result.hostRoot;
    this.rememberRecent(result.root);
    this.close();
    this.state.userAdjusted = false;
    this.bus.emit("graph:reload", undefined);
    this.bus.emit("toast", t("toast.opened", { name: this.basename(result.root) }));
  }
}
