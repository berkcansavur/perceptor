import type { ApiClient } from "../api/ApiClient";
import type { Emitter } from "../events";
import { byId } from "../dom";
import { t } from "../i18n";

// "Add behavior" modal: describe a new method for a class → an add-behavior task.
export class BehaviorForm {
  private readonly modal = byId("behavior-modal");
  private readonly error = byId("behavior-error");
  private readonly modeSelect = byId<HTMLSelectElement>("behavior-error-mode");
  private readonly exceptionInput = byId<HTMLInputElement>("behavior-exception");
  private readonly signatureInput = byId<HTMLInputElement>("behavior-sig");
  private readonly target = { class: "", file: "" };
  private exceptionEdited = false;

  constructor(
    private readonly api: ApiClient,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    this.bus.on("form:behavior", ({ className, file }) => this.open(className, file));
    this.signatureInput.addEventListener("input", () => this.suggestException());
    this.modeSelect.addEventListener("change", () => this.syncExceptionVisibility());
    this.exceptionInput.addEventListener("input", () => {
      this.exceptionEdited = true;
    });
    byId("behavior-cancel").addEventListener("click", () => this.close());
    byId("behavior-confirm").addEventListener("click", () => void this.confirm());
    this.modal.addEventListener("mousedown", (event) => {
      if (event.target === this.modal) {
        this.close();
      }
    });
  }

  private open(className: string, file: string): void {
    this.target.class = className;
    this.target.file = file;
    this.exceptionEdited = false;
    byId("behavior-target").textContent = className;
    byId<HTMLInputElement>("behavior-name").value = "";
    byId<HTMLTextAreaElement>("behavior-desc").value = "";
    this.signatureInput.value = "";
    this.modeSelect.value = "throw";
    this.suggestException();
    this.error.classList.add("hidden");
    this.modal.classList.remove("hidden");
    byId("behavior-desc").focus();
  }

  private close(): void {
    this.modal.classList.add("hidden");
  }

  private syncExceptionVisibility(): void {
    this.exceptionInput.style.display = this.modeSelect.value === "throw" ? "" : "none";
  }

  private suggestException(): void {
    if (this.exceptionEdited) {
      return;
    }
    const returnType = this.returnTypeOf(this.signatureInput.value);
    const entity = (returnType && this.baseEntityOf(returnType)) || this.entityFromClass(this.target.class);
    this.exceptionInput.value = entity ? `${entity}NotFoundException` : "";
    if (returnType && this.isNullableType(returnType)) {
      this.modeSelect.value = "throw";
    }
    this.syncExceptionVisibility();
  }

  private entityFromClass(className: string): string {
    return className.replace(/(Service|Repository|Controller|Manager|Handler|UseCase)$/, "") || className;
  }

  private returnTypeOf(signature: string): string {
    const match = signature.match(/\)\s*:\s*(.+)$/);
    return match ? (match[1] ?? "").trim() : "";
  }

  private isNullableType(returnType: string): boolean {
    return /\b(undefined|null)\b/.test(returnType) || /\?\s*$/.test(returnType);
  }

  private baseEntityOf(returnType: string): string {
    return returnType
      .replace(/\|.*$/, "")
      .replace(/<.*>/, "")
      .replace(/\[\]/g, "")
      .replace(/\?/g, "")
      .replace(/Promise|Optional|List|Array|Task/gi, "")
      .replace(/[<>]/g, "")
      .trim();
  }

  private async confirm(): Promise<void> {
    const description = byId<HTMLTextAreaElement>("behavior-desc").value.trim();
    if (!description) {
      this.error.textContent = t("addbeh.error");
      this.error.classList.remove("hidden");
      return;
    }
    await this.api.enqueueTask({
      type: "add-behavior",
      from: { class: this.target.class, file: this.target.file },
      spec: {
        name: byId<HTMLInputElement>("behavior-name").value.trim(),
        description,
        signature: this.signatureInput.value.trim(),
        errorHandling: {
          mode: this.modeSelect.value,
          exception: this.modeSelect.value === "throw" ? this.exceptionInput.value.trim() : "",
        },
      },
    });
    this.close();
    this.bus.emit("toast", t("toast.taskAdd", { class: this.target.class }));
    this.bus.emit("tasks:refresh", undefined);
    this.bus.emit("tasks:open", undefined);
  }
}
