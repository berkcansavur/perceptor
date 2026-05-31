import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import { byId } from "../dom";
import { t } from "../i18n";

const REFRESH_MS = 5000;

// Which DOM nodes this control drives — so the same logic mounts in both the Tasks
// drawer and the Chat tab without duplication.
export type AutoProcessElements = {
  container: string;
  toggle: string;
  label: string;
  status: string;
}

// The "Auto-process" toggle. Polls server availability and explains when it is
// host-only (Docker) instead of silently hiding. Mounted in more than one place;
// a flip in one broadcasts `auto:changed` so the others resync immediately.
export class AutoProcessControl {
  constructor(
    private readonly api: Api,
    private readonly ids: AutoProcessElements,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    const toggle = byId<HTMLInputElement>(this.ids.toggle);
    toggle.addEventListener("change", async () => {
      await this.api.setAuto(toggle.checked);
      this.bus.emit("auto:changed", undefined);
      void this.refresh();
    });
    this.bus.on("auto:changed", () => void this.refresh());
    void this.refresh();
    setInterval(() => void this.refresh(), REFRESH_MS);
  }

  private async refresh(): Promise<void> {
    let info;
    try {
      info = await this.api.autoStatus();
    } catch {
      return;
    }
    byId(this.ids.container).classList.remove("hidden");
    const toggle = byId<HTMLInputElement>(this.ids.toggle);
    const label = byId(this.ids.label);
    const status = byId(this.ids.status);
    if (!info.available) {
      toggle.style.display = "none";
      label.style.display = "none";
      status.textContent = info.reason === "docker" ? t("auto.unavailableDocker") : t("auto.unavailable");
      return;
    }
    toggle.style.display = "";
    label.style.display = "";
    if (document.activeElement !== toggle) {
      toggle.checked = Boolean(info.enabled);
    }
    status.textContent = info.running ? `· ${t("task.processing")}` : "";
  }
}
