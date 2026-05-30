import type { ApiClient } from "../api/ApiClient";
import { byId } from "../dom";
import { t } from "../i18n";

// The "Auto-process" toggle in the Tasks drawer. Polls server availability and
// explains when it is host-only (Docker) instead of silently hiding.
export class AutoProcessControl {
  private readonly toggle = byId<HTMLInputElement>("auto-toggle");
  private readonly labelText = byId("auto-label-text");
  private readonly status = byId("auto-status");

  constructor(private readonly api: ApiClient) {}

  setup(): void {
    this.toggle.addEventListener("change", async () => {
      await this.api.setAuto(this.toggle.checked);
      void this.refresh();
    });
    void this.refresh();
    setInterval(() => void this.refresh(), 5000);
  }

  private async refresh(): Promise<void> {
    let info;
    try {
      info = await this.api.autoStatus();
    } catch {
      return;
    }
    byId("auto-process").classList.remove("hidden");
    if (!info.available) {
      this.toggle.style.display = "none";
      this.labelText.style.display = "none";
      this.status.textContent = info.reason === "docker" ? t("auto.unavailableDocker") : t("auto.unavailable");
      return;
    }
    this.toggle.style.display = "";
    this.labelText.style.display = "";
    if (document.activeElement !== this.toggle) {
      this.toggle.checked = Boolean(info.enabled);
    }
    this.status.textContent = info.running ? `· ${t("task.processing")}` : "";
  }
}
