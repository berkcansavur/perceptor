import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import type { TemplateRegistry } from "../types";
import { byId } from "../dom";
import { t } from "../i18n";

const NAMED_TEMPLATES = new Set([
  "class", "abstract-class", "interface", "enum", "type", "record",
  "function", "struct", "trait", "protocol", "object", "module",
]);

// "New file / folder" modal. The template options are extension-driven and the
// registry comes from the server (single source of truth).
export class CreateForm {
  private readonly modal = byId("create-modal");
  private readonly title = byId("create-title");
  private readonly dirInput = byId<HTMLInputElement>("create-dir");
  private readonly nameInput = byId<HTMLInputElement>("create-name");
  private readonly templateLabel = byId("create-filetype-label");
  private readonly templateSelect = byId<HTMLSelectElement>("create-filetype");
  private readonly typeNameInput = byId<HTMLInputElement>("create-typename");
  private readonly error = byId("create-error");
  private readonly target = { kind: "file" };
  private lastFamily: string | null = null;
  private registry: TemplateRegistry = { extensionFamily: {}, familyTemplates: { other: ["empty"] } };

  constructor(
    private readonly api: Api,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    void this.loadTemplates();
    this.bus.on("form:create", ({ kind, dir }) => this.open(kind, dir));
    this.nameInput.addEventListener("input", () => {
      if (this.target.kind === "file") {
        this.populateTemplates();
      }
    });
    this.templateSelect.addEventListener("change", () => this.syncTypeNameVisibility());
    byId("create-cancel").addEventListener("click", () => this.close());
    byId("create-confirm").addEventListener("click", () => void this.confirm());
    this.modal.addEventListener("mousedown", (event) => {
      if (event.target === this.modal) {
        this.close();
      }
    });
  }

  private async loadTemplates(): Promise<void> {
    try {
      this.registry = await this.api.fileTemplates();
    } catch {
      /* keep fallback */
    }
  }

  private open(kind: string, dir: string): void {
    this.target.kind = kind;
    const isFile = kind === "file";
    this.title.textContent = `${isFile ? t("create.file") : t("create.folder")} ${t("create.in")} ${dir || "/"}`;
    this.dirInput.value = dir || "";
    this.nameInput.placeholder = isFile ? t("create.name") : t("create.folderName");
    this.nameInput.value = "";
    this.typeNameInput.value = "";
    this.lastFamily = null;
    this.showFileFields(isFile);
    if (isFile) {
      this.populateTemplates();
    }
    this.error.classList.add("hidden");
    this.modal.classList.remove("hidden");
    this.nameInput.focus();
  }

  private close(): void {
    this.modal.classList.add("hidden");
  }

  private fileBaseName(): string {
    return this.nameInput.value.trim().replace(/\.[^.]+$/, "");
  }

  private fileFamilyOf(fileName: string): string {
    const lower = fileName.trim().toLowerCase();
    if (lower === "dockerfile" || lower.startsWith("dockerfile.") || lower.endsWith(".dockerfile")) {
      return "dockerfile";
    }
    const extension = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
    return this.registry.extensionFamily[extension] ?? "other";
  }

  private templatesFor(family: string): string[] {
    return this.registry.familyTemplates[family] ?? this.registry.familyTemplates["other"] ?? ["empty"];
  }

  private syncTypeNameVisibility(): void {
    const needsTypeName = NAMED_TEMPLATES.has(this.templateSelect.value);
    this.typeNameInput.style.display = needsTypeName ? "" : "none";
    if (needsTypeName && !this.typeNameInput.value.trim()) {
      this.typeNameInput.value = this.fileBaseName();
    }
  }

  private populateTemplates(): void {
    const family = this.fileFamilyOf(this.nameInput.value);
    const options = this.templatesFor(family);
    const familyChanged = family !== this.lastFamily;
    const previous = this.templateSelect.value;
    this.templateSelect.innerHTML = options
      .map((value) => `<option value="${value}">${t("tpl." + value)}</option>`)
      .join("");
    let next = familyChanged || !options.includes(previous) ? options[0] ?? "empty" : previous;
    if (this.fileBaseName().toLowerCase() === "index" && options.includes("barrel")) {
      next = "barrel";
    }
    this.templateSelect.value = next;
    this.lastFamily = family;
    this.syncTypeNameVisibility();
  }

  private showFileFields(isFile: boolean): void {
    this.templateLabel.style.display = isFile ? "" : "none";
    this.templateSelect.style.display = isFile ? "" : "none";
    this.typeNameInput.style.display = isFile ? "" : "none";
  }

  private async confirm(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.fail(t("addbeh.error"));
      return;
    }
    const body: Record<string, string> = { kind: this.target.kind, dir: this.dirInput.value.trim(), name };
    if (this.target.kind === "file") {
      body["template"] = this.templateSelect.value;
      if (NAMED_TEMPLATES.has(this.templateSelect.value)) {
        body["typeName"] = this.typeNameInput.value.trim() || this.fileBaseName();
      }
    }
    try {
      await this.api.create(body);
    } catch {
      this.fail(t("create.failed"));
      return;
    }
    this.close();
    this.bus.emit("toast", t("toast.created", { name }));
    this.bus.emit("graph:reload", undefined);
    this.bus.emit("mode:set", "folder");
  }

  private fail(message: string): void {
    this.error.textContent = message;
    this.error.classList.remove("hidden");
  }
}
