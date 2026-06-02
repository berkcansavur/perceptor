import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import type { AppEvents, FlowReport } from "../types";
import { byId } from "../dom";
import { entitlements } from "../entitlements";
import { t } from "../i18n";
import { complexityStrip } from "../complexity/complexityStrip";
import { queryStrip } from "../complexity/queryStrip";
import { flowStrip } from "../complexity/flowStrip";
import { flowOutline } from "../complexity/flowOutline";
import { FlowPlayer } from "../complexity/FlowPlayer";
import { FlowSimulator } from "../complexity/FlowSimulator";

type BehaviorContext = AppEvents["behavior:open"];

const SUMMARY_POLL_MS = 1500;
const SUMMARY_TIMEOUT_MS = 120000;

// The right-side method panel (Folder mode): signature + source preview (instant)
// and an optional Claude one-line summary, with an Edit button into the edit flow.
export class BehaviorDrawer {
  private readonly drawer = byId("behavior-drawer");
  private readonly flowPlayer = new FlowPlayer();
  private readonly flowSimulator = new FlowSimulator();
  // The most recently extracted control-flow tree for the open method, kept so Explain can
  // hand its compact outline to Claude as token-optimized narration context. Reset on open.
  private lastFlow: FlowReport = { steps: [] };
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
    this.initResize();
  }

  // Let the user widen the drawer by dragging its left edge. The panel is right-anchored, so
  // growing its width expands it leftward; it can never shrink below its CSS min-width (the
  // size it opens at). Nothing else on the page is touched.
  private initResize(): void {
    const handle = byId("behavior-drawer-resizer");
    handle.addEventListener("pointerdown", (event: PointerEvent) => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("behavior-resizing");
      const startX = event.clientX;
      const startWidth = this.drawer.getBoundingClientRect().width;
      const move = (move: PointerEvent): void => {
        // Drag left (smaller clientX) → wider drawer. CSS min/max-width clamp the extremes.
        this.drawer.style.width = `${startWidth + (startX - move.clientX)}px`;
      };
      const up = (): void => {
        handle.releasePointerCapture(event.pointerId);
        document.body.classList.remove("behavior-resizing");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  private async open(payload: BehaviorContext): Promise<void> {
    this.stopSummaryPoll();
    this.context = payload;
    this.lastFlow = { steps: [] };
    byId("behavior-drawer-title").textContent = `${payload.behavior}()  ·  ${payload.className}`;
    byId("behavior-drawer-sig").textContent = payload.signature;
    byId("behavior-drawer-code").textContent = "";
    byId("behavior-drawer-complexity").innerHTML = "";
    this.flowPlayer.stop();
    byId("behavior-drawer-flow").innerHTML = "";
    byId("behavior-drawer-flow-section").classList.add("hidden");
    this.drawer.classList.remove("hidden");
    document.body.classList.add("behavior-open");
    void this.loadSource();
    void this.loadSummary();
  }

  // Fetch the method source once, show it, and derive its static complexity from the
  // very same text (no second round trip for the body).
  private async loadSource(): Promise<void> {
    let code = "";
    try {
      code = await this.api.source(this.context.file, this.context.line, this.context.endLine);
    } catch {
      code = "";
    }
    byId("behavior-drawer-code").textContent = code;
    await this.loadComplexity(code);
  }

  private async loadComplexity(code: string): Promise<void> {
    const element = byId("behavior-drawer-complexity");
    if (!code) {
      element.textContent = "";
      return;
    }
    try {
      const { report, query, flow } = await this.api.complexity(code, this.context.behavior, this.context.file);
      element.classList.remove("cx-unavailable");
      element.innerHTML = complexityStrip(report) + queryStrip(query);
      this.renderFlow(flow);
    } catch {
      element.textContent = "";
    }
  }

  private renderFlow(flow: FlowReport): void {
    this.lastFlow = flow;
    const container = byId("behavior-drawer-flow");
    const section = byId("behavior-drawer-flow-section");
    if (!entitlements().has("runFlow")) {
      container.innerHTML = "";
      section.classList.add("hidden");
      return;
    }
    const markup = flowStrip(flow);
    container.innerHTML = markup;
    section.classList.toggle("hidden", markup === "");
    const strip = container.querySelector<HTMLElement>(".fx-strip");
    if (strip) {
      this.flowPlayer.attach(strip);
      this.flowSimulator.attach(strip, flow, this.flowPlayer);
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
    await this.api.describeBehavior({
      className: this.context.className,
      file: this.context.file,
      behavior: this.context.behavior,
      line: this.context.line,
      endLine: this.context.endLine,
      flowOutline: flowOutline(this.lastFlow),
    });
    const element = byId("behavior-drawer-summary");
    // Without Auto-process enabled, the queued describe task is never picked up — so the
    // poll below would spin forever and the user would see "summarizing…" with nothing
    // happening. Tell them how to make it run instead of leaving a silent spinner.
    const enabled = await this.autoEnabled();
    element.textContent = enabled ? t("behavior.explaining") : t("behavior.explainOffline");
    element.classList.add("muted");
    if (enabled) {
      this.pollSummary(file, behavior, baselineAt);
    }
  }

  private async autoEnabled(): Promise<boolean> {
    try {
      return (await this.api.autoStatus()).enabled;
    } catch {
      return false;
    }
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
    this.flowPlayer.stop();
    this.drawer.classList.add("hidden");
    document.body.classList.remove("behavior-open");
  }
}
