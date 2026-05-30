import type { ApiClient } from "../api/ApiClient";
import type { Emitter } from "../events";
import { byId } from "../dom";
import { t } from "../i18n";

// "Edit behavior" modal: shows the method's current source and asks how it
// should change → an edit-behavior task.
export class EditForm {
  private readonly modal = byId("edit-modal");
  private readonly codeView = byId("edit-code");
  private readonly descInput = byId<HTMLTextAreaElement>("edit-desc");
  private readonly sigInput = byId<HTMLInputElement>("edit-sig");
  private readonly error = byId("edit-error");
  private readonly target = { class: "", file: "", behavior: "", line: "0", endLine: "0" };

  constructor(
    private readonly api: ApiClient,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    this.bus.on("form:edit", (payload) =>
      void this.open(payload.className, payload.file, payload.behavior, payload.line, payload.endLine)
    );
    byId("edit-cancel").addEventListener("click", () => this.close());
    byId("edit-confirm").addEventListener("click", () => void this.confirm());
    this.modal.addEventListener("mousedown", (event) => {
      if (event.target === this.modal) {
        this.close();
      }
    });
  }

  private async open(className: string, file: string, behavior: string, line: string, endLine: string): Promise<void> {
    Object.assign(this.target, { class: className, file, behavior, line, endLine });
    byId("edit-target").textContent = `${behavior}()`;
    this.descInput.value = "";
    this.sigInput.value = "";
    this.error.classList.add("hidden");
    this.codeView.textContent = "…";
    this.modal.classList.remove("hidden");
    this.descInput.focus();
    try {
      const data = await this.api.source(file, line, endLine);
      this.codeView.textContent = data.ok ? data.code ?? "" : "(source unavailable)";
    } catch {
      this.codeView.textContent = "(source unavailable)";
    }
  }

  private close(): void {
    this.modal.classList.add("hidden");
  }

  private async confirm(): Promise<void> {
    const description = this.descInput.value.trim();
    if (!description) {
      this.error.textContent = t("addbeh.error");
      this.error.classList.remove("hidden");
      return;
    }
    await this.api.enqueueTask({
      type: "edit-behavior",
      from: { class: this.target.class, file: this.target.file, behavior: this.target.behavior },
      spec: {
        line: Number(this.target.line),
        endLine: Number(this.target.endLine),
        description,
        signature: this.sigInput.value.trim(),
      },
    });
    this.close();
    this.bus.emit("toast", t("toast.taskAdd", { class: this.target.class }));
    this.bus.emit("tasks:refresh", undefined);
    this.bus.emit("tasks:open", undefined);
  }
}
