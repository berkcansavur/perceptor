import { qsa } from "../dom";
import { t } from "../i18n";

// Per-step dwell time for each speed. Default is "normal" — a comfortable follow-along pace
// that's neither sluggish nor a skim.
type Speed = "slow" | "normal" | "fast";

const SPEED_MS: Record<Speed, number> = {
  slow: 1900,
  normal: 1100,
  fast: 550,
};

// Drives the run-flow storyboard playback in JS (rather than a one-shot CSS stagger) so the
// reveal can be paused and resumed from where it stopped, and its speed changed live. One
// instance is reused across method panels: `attach` rebinds it to each freshly-rendered
// strip. Steps are fully visible by default (the panel reads without playing); pressing
// Play "arms" the strip — hides every step — then reveals them one at a time.
export class FlowPlayer {
  private steps: HTMLElement[] = [];
  private index = 0; // the next step to reveal (0…steps.length)
  // Index of the step after which playback halts because the method has returned/thrown there
  // (a terminal on the live path ends the run). -1 when no such cut applies.
  private stopAt = -1;
  private timer: number | null = null;
  private playing = false;
  private speed: Speed = "normal";
  private root: HTMLElement | null = null;

  // Bind to a newly-rendered `.fx-strip`, discarding any previous playback state. Wires the
  // controls once (call `resync` afterwards to re-read steps without rebinding).
  attach(root: HTMLElement): void {
    this.stop();
    this.root = root;
    this.bind(root);
    this.resync();
  }

  // Re-read the step set from the current DOM without touching the control bindings. Steps the
  // simulator has marked `.fx-skip` (a branch arm the payload doesn't take) are excluded, so
  // playback animates only the live path. Safe to call after any class change on the rows.
  resync(): void {
    this.clearTimer();
    this.playing = false;
    this.steps = this.root
      ? qsa<HTMLElement>(this.root, ".fx-step").filter((step) => !step.classList.contains("fx-skip"))
      : [];
    this.index = 0;
    this.stopAt = this.computeStop();
    this.root?.classList.remove("fx-armed");
    this.steps.forEach((step) => step.classList.remove("fx-active"));
    this.syncControls();
  }

  // The index at which a `return`/`throw` ends the run. Once a payload has been simulated the
  // surviving rows are a single concrete path, so the first terminal on it ends the method.
  // Without simulation we only stop at a *top-level* terminal (depth 0) — a `return` nested in
  // one `if` arm must not cut off the other arm, which plain playback still wants to show.
  private computeStop(): number {
    const simulated = this.root?.classList.contains("fx-simulated") ?? false;
    for (let i = 0; i < this.steps.length; i += 1) {
      const step = this.steps[i];
      if (!step || step.dataset.fxTerminal !== "1") {
        continue;
      }
      const depth0 = step.style.getPropertyValue("--fx-depth").trim() === "0";
      if (simulated || depth0) {
        return i;
      }
    }
    return -1;
  }

  // Start playback from the very beginning (used by the simulator's Run, which has just
  // re-scoped the step set to the taken path).
  start(): void {
    this.index = 0;
    this.play();
  }

  // Halt playback (e.g. the panel is closing or switching methods). Safe to call anytime.
  stop(): void {
    this.clearTimer();
    this.playing = false;
  }

  private bind(root: HTMLElement): void {
    root.querySelector("[data-fx-toggle]")?.addEventListener("click", () => this.toggle());
    root.querySelector("[data-fx-replay]")?.addEventListener("click", () => this.replay());
    const speed = root.querySelector<HTMLSelectElement>("[data-fx-speed]");
    speed?.addEventListener("change", () => {
      this.speed = this.normaliseSpeed(speed.value);
      if (this.playing) {
        this.schedule(); // apply the new cadence without interrupting the reveal
      }
    });
  }

  private toggle(): void {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  private play(): void {
    if (!this.root || this.steps.length === 0) {
      return;
    }
    this.root.classList.add("fx-armed");
    // Finished → a fresh run; at the start → hide everything first. Mid-way → resume as-is.
    if (this.index >= this.steps.length) {
      this.index = 0;
    }
    if (this.index === 0) {
      this.hideAll();
    }
    this.playing = true;
    this.revealNext(); // immediate feedback, then keep going on the interval
    if (this.index >= this.steps.length || this.justRevealedTerminal()) {
      this.finish();
      return;
    }
    this.schedule();
    this.syncControls();
  }

  private pause(): void {
    this.clearTimer();
    this.playing = false;
    this.syncControls();
  }

  private replay(): void {
    this.stop();
    this.index = 0;
    this.play();
  }

  private schedule(): void {
    this.clearTimer();
    this.timer = window.setInterval(() => this.tick(), SPEED_MS[this.speed]);
  }

  private tick(): void {
    this.revealNext();
    if (this.index >= this.steps.length || this.justRevealedTerminal()) {
      this.finish();
    }
  }

  // True when the step just revealed is the terminal cut — the method returns/throws here, so
  // playback ends and the rows beyond it stay hidden (they don't run).
  private justRevealedTerminal(): boolean {
    return this.stopAt >= 0 && this.index - 1 === this.stopAt;
  }

  // Reveal the step at `index`, mark it the active (highlighted) one, and advance.
  private revealNext(): void {
    const step = this.steps[this.index];
    if (!step) {
      return;
    }
    this.steps.forEach((other) => other.classList.remove("fx-active"));
    step.classList.add("fx-revealed", "fx-active");
    this.index += 1;
  }

  private finish(): void {
    this.clearTimer();
    this.playing = false;
    this.steps.forEach((step) => step.classList.remove("fx-active"));
    this.syncControls();
  }

  private hideAll(): void {
    this.steps.forEach((step) => step.classList.remove("fx-revealed", "fx-active"));
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Reflect state on the play/pause button: Pause while running, Resume when paused
  // mid-way, Play otherwise (start or replay-after-finish).
  private syncControls(): void {
    const toggle = this.root?.querySelector<HTMLElement>("[data-fx-toggle]");
    if (!toggle) {
      return;
    }
    const midway = this.index > 0 && this.index < this.steps.length;
    toggle.textContent = this.playing ? t("fx.pause") : midway ? t("fx.resume") : t("fx.play");
    toggle.classList.toggle("fx-playing", this.playing);
  }

  private normaliseSpeed(value: string): Speed {
    return value === "slow" || value === "normal" || value === "fast" ? value : "normal";
  }
}
