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
  // Hook the FlowSimulator installs when a method has an editable payload: Run re-simulates the
  // taken path (then plays it). Left null for methods with no payload, where Run falls back to
  // plain playback. Clear needs no hook — the player strips the simulation styling itself.
  onRun: (() => void) | null = null;
  private steps: HTMLElement[] = [];
  private index = 0; // the next step to reveal (0…steps.length)
  // Index of the step after which playback halts because the method has returned/thrown there
  // (a terminal on the live path ends the run). -1 when no such cut applies.
  private stopAt = -1;
  private timer: number | null = null;
  private playing = false;
  private speed: Speed = "normal";
  private root: HTMLElement | null = null;
  private runButton: HTMLElement | null = null;

  // Bind to a newly-rendered `.fx-strip`, discarding any previous playback state. Wires the
  // controls once (call `resync` afterwards to re-read steps without rebinding).
  attach(root: HTMLElement): void {
    this.stop();
    this.root = root;
    // Drop the run hook from the previous method; the FlowSimulator reinstalls it if this one
    // has a payload (it attaches right after us).
    this.onRun = null;
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
    this.updateRunLabel("run");
    this.steps.forEach((step) => step.classList.remove("fx-active"));
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
    this.runButton = root.querySelector<HTMLElement>("[data-fx-run]");
    this.runButton?.addEventListener("click", () => this.runClicked());
    root.querySelector("[data-fx-clear]")?.addEventListener("click", () => this.clearClicked());
    root.querySelector("[data-fx-replay]")?.addEventListener("click", () => this.replay());
    const speed = root.querySelector<HTMLSelectElement>("[data-fx-speed]");
    speed?.addEventListener("change", () => {
      this.speed = this.normaliseSpeed(speed.value);
      if (this.playing) {
        this.schedule(); // apply the new cadence without interrupting the reveal
      }
    });
  }

  // Run: re-simulate the taken path when a payload is wired (the simulator's hook ends by
  // calling start, so playback follows), else just play the static steps from the top.
  private runClicked(): void {
    if (this.playing) {
      this.pause();
      return;
    }
    if (this.index > 0 && this.index < this.steps.length) {
      this.resume();
      return;
    }
    if (this.onRun) {
      this.onRun();
    } else {
      this.replay();
    }
  }

  // Clear: strip any simulation styling the FlowSimulator applied (taken/untaken/skipped rows
  // and their verdict labels), then reset the reveal. Self-contained so it always clears the
  // simulated path, whether or not a payload is wired.
  private clearClicked(): void {
    if (this.root) {
      for (const row of qsa<HTMLElement>(this.root, ".fx-step")) {
        row.classList.remove("fx-skip", "fx-taken", "fx-untaken");
        row.querySelector<HTMLElement>(".fx-line")?.removeAttribute("data-fx-verdict");
      }
      this.root.classList.remove("fx-simulated");
    }
    this.resync();
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
    this.updateRunLabel("pause");
    this.revealNext(); // immediate feedback, then keep going on the interval
    if (this.index >= this.steps.length || this.justRevealedTerminal()) {
      this.finish();
      return;
    }
    this.schedule();
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
    this.updateRunLabel("run");
    this.steps.forEach((step) => step.classList.remove("fx-active"));
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

  private normaliseSpeed(value: string): Speed {
    return value === "slow" || value === "normal" || value === "fast" ? value : "normal";
  }

  private pause(): void {
    this.clearTimer();
    this.playing = false;
    this.updateRunLabel("continue");
  }

  private resume(): void {
    this.playing = true;
    this.updateRunLabel("pause");
    this.revealNext();
    if (this.index >= this.steps.length || this.justRevealedTerminal()) {
      this.finish();
      return;
    }
    this.schedule();
  }

  private updateRunLabel(state: "run" | "pause" | "continue"): void {
    if (!this.runButton) return;
    const key = state === "pause" ? "fx.pause" : state === "continue" ? "fx.continue" : "fx.run";
    this.runButton.textContent = t(key);
  }
}
