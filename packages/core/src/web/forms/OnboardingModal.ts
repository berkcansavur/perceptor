import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import { byId } from "../dom";

const ONBOARDED_KEY = "perceptorOnboarded";

// First-run welcome. Auto-processing (your own local Claude carrying out the changes you
// describe) is the single feature that spends Claude tokens, so we ask the user to opt in
// once instead of enabling it silently. Shown only when it's actually available on this
// host and the user hasn't answered before; the answer is remembered so we never nag.
export class OnboardingModal {
  private readonly modal = byId("onboarding-modal");

  constructor(
    private readonly api: Api,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    byId("onboarding-enable").addEventListener("click", () => void this.answer(true));
    byId("onboarding-skip").addEventListener("click", () => void this.answer(false));
  }

  async maybeShow(): Promise<void> {
    if (this.answered()) {
      return;
    }
    let status;
    try {
      status = await this.api.autoStatus();
    } catch {
      return;
    }
    // Can't enable here (no Claude CLI / Docker) — stay silent and ask another time when
    // it becomes available, rather than offering a toggle that would do nothing.
    if (!status.available) {
      return;
    }
    // Already on (e.g. via the autoProcessOnOpen setting) — treat as opted in, don't ask.
    if (status.enabled) {
      this.remember();
      return;
    }
    this.modal.classList.remove("hidden");
  }

  private async answer(enable: boolean): Promise<void> {
    try {
      await this.api.setAuto(enable);
      this.bus.emit("auto:changed", undefined);
    } catch {
      // The toggle stays in its current state; the user can still set it in Preferences.
    }
    this.remember();
    this.modal.classList.add("hidden");
  }

  private answered(): boolean {
    return typeof localStorage !== "undefined" && localStorage.getItem(ONBOARDED_KEY) === "1";
  }

  private remember(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ONBOARDED_KEY, "1");
    }
  }
}
