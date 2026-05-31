import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import type { AppEvents } from "../types";
import { byId } from "../dom";
import { t } from "../i18n";

type BehaviorContext = AppEvents["behavior:open"];

const SUMMARY_POLL_MS = 1500;
const SUMMARY_TIMEOUT_MS = 120000;

// The right-side method panel (Folder mode): signature + source preview (instant)
// and an optional Claude one-line summary, with an Edit button into the edit flow.
export class BehaviorDrawer {
  private readonly drawer = byId("behavior-drawer");
  private summaryPollTimer: number | null = null;
  private context: BehaviorContext = {
    className: "",
    file: "",
    behavior: "",
    line: "0",
    endLine: "0",
    signature: "",
  };

  constructor(
    private readonly api: Api,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    this.bus.on("behavior:open", (payload) => void this.open(payload));
    byId("behavior-drawer-close").addEventListener("click", () => this.close());
    byId("behavior-edit").addEventListener("click", () => this.edit());
    byId("behavior-explain").addEventListener("click", () => void this.explain());
  }

  private async open(payload: BehaviorContext): Promise<void> {
    this.stopSummaryPoll();
    this.context = payload;
    byId("behavior-drawer-title").textContent = `${payload.behavior}()  ·  ${payload.className}`;
    byId("behavior-drawer-sig").textContent = payload.signature;
    byId("behavior-drawer-code").textContent = "";
    this.drawer.classList.remove("hidden");
    document.body.classList.add("behavior-open");
    void this.loadSource();
    void this.loadSummary();
  }

  private async loadSource(): Promise<void> {
    try {
      byId("behavior-drawer-code").textContent = await this.api.source(
        this.context.file,
        this.context.line,
        this.context.endLine
      );
    } catch {
      byId("behavior-drawer-code").textContent = "";
    }
  }

  private async loadSummary(): Promise<void> {
    const element = byId("behavior-drawer-summary");
    let summary;
    try {
      summary = await this.api.behaviorSummary(this.context.file, this.context.behavior);
    } catch {
      return;
    }
    if (summary) {
      element.textContent = summary.text;
      element.classList.remove("muted");
    } else {
      element.textContent = t("behavior.noSummary");
      element.classList.add("muted");
    }
  }

  // Enqueue a summary task, then poll the cache until Claude writes a fresh one —
  // without polling, the result never reaches the drawer even once it's ready.
  private async explain(): Promise<void> {
    const { file, behavior } = this.context;
    const baseline = await this.api.behaviorSummary(file, behavior);
    const baselineAt = baseline?.at ?? "";
    await this.api.describeBehavior(this.context);
    const element = byId("behavior-drawer-summary");
    element.textContent = t("behavior.explaining");
    element.classList.add("muted");
    this.pollSummary(file, behavior, baselineAt);
  }

  private pollSummary(file: string, behavior: string, baselineAt: string): void {
    this.stopSummaryPoll();
    const startedAt = Date.now();
    this.summaryPollTimer = window.setInterval(() => {
      if (this.context.file !== file || this.context.behavior !== behavior || this.isClosed()) {
        this.stopSummaryPoll();
        return;
      }
      void this.tryApplySummary(file, behavior, baselineAt, startedAt);
    }, SUMMARY_POLL_MS);
  }

  private async tryApplySummary(
    file: string,
    behavior: string,
    baselineAt: string,
    startedAt: number
  ): Promise<void> {
    let summary;
    try {
      summary = await this.api.behaviorSummary(file, behavior);
    } catch {
      return;
    }
    if (summary && summary.at !== baselineAt) {
      const element = byId("behavior-drawer-summary");
      element.textContent = summary.text;
      element.classList.remove("muted");
      this.stopSummaryPoll();
      return;
    }
    if (Date.now() - startedAt > SUMMARY_TIMEOUT_MS) {
      this.stopSummaryPoll();
    }
  }

  private stopSummaryPoll(): void {
    if (this.summaryPollTimer !== null) {
      clearInterval(this.summaryPollTimer);
      this.summaryPollTimer = null;
    }
  }

  private isClosed(): boolean {
    return this.drawer.classList.contains("hidden");
  }

  private edit(): void {
    this.bus.emit("form:edit", {
      className: this.context.className,
      file: this.context.file,
      behavior: this.context.behavior,
      line: this.context.line,
      endLine: this.context.endLine,
    });
    this.close();
  }

  private close(): void {
    this.stopSummaryPoll();
    this.drawer.classList.add("hidden");
    document.body.classList.remove("behavior-open");
  }
}
