import { t } from "../i18n";
import type { Api } from "../api/ApiClient";

export type AttachmentRef = {
  name: string;
  path: string;
  dataUrl: string;
};

export class ImageAttachment {
  private readonly previewContainer: HTMLElement;
  private attachments: AttachmentRef[] = [];
  private readonly dropZone: HTMLElement;
  private readonly overlay: HTMLElement;

  constructor(
    private readonly input: HTMLTextAreaElement,
    private readonly composer: HTMLElement,
    private readonly api: Api,
    dropZone: HTMLElement
  ) {
    this.previewContainer = document.createElement("div");
    this.previewContainer.className = "attachment-preview hidden";
    this.composer.insertBefore(this.previewContainer, this.input);
    this.bindPasteHandler();
    this.bindDropHandler();

    this.dropZone = dropZone;
    this.overlay = document.createElement("div");
    this.overlay.className = "drop-overlay hidden";
    this.overlay.innerHTML = `<span class="drop-overlay-label">${t("chat.dropHere")}</span>`;
    this.dropZone.style.position = "relative";
    this.dropZone.appendChild(this.overlay);

    this.bindZoneDropHandler();
  }

  private bindPasteHandler(): void {
    this.input.addEventListener("paste", (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.type.startsWith("image/")) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) void this.addImage(file);
          return;
        }
      }
    });
  }

  private bindDropHandler(): void {
    document.addEventListener("dragover", (event: DragEvent) => {
      event.preventDefault();
    });
    document.addEventListener("drop", (event: DragEvent) => {
      event.preventDefault();
    });
  }

  private bindZoneDropHandler(): void {
    this.dropZone.addEventListener("dragenter", (event: DragEvent) => {
      event.preventDefault();
      if (!this.isFileDrag(event)) return;
      this.overlay.classList.remove("hidden");
    });
    this.overlay.addEventListener("dragover", (event: DragEvent) => {
      event.preventDefault();
    });
    this.overlay.addEventListener("dragleave", (event: DragEvent) => {
      if (!this.overlay.contains(event.relatedTarget as Node)) {
        this.overlay.classList.add("hidden");
      }
    });
    this.overlay.addEventListener("drop", (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      this.overlay.classList.add("hidden");
      const files = event.dataTransfer?.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file) {
          void this.addImage(file);
        }
      }
    });
  }

  private isFileDrag(event: DragEvent): boolean {
    return Boolean(event.dataTransfer?.types.includes("Files"));
  }

  private async addImage(file: File): Promise<void> {
    const dataUrl = await this.readAsDataUrl(file);
    const name = file.name || `image-${Date.now()}.png`;
    let uploadResult: { path: string };
    try {
      uploadResult = await this.api.uploadAttachment(dataUrl, name);
    } catch {
      return;
    }
    const attachment: AttachmentRef = { name, path: uploadResult.path, dataUrl };
    this.attachments.push(attachment);
    this.renderPreview();
  }

  private readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (): void => resolve(reader.result as string);
      reader.onerror = (): void => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private renderPreview(): void {
    if (this.attachments.length === 0) {
      this.previewContainer.classList.add("hidden");
      this.previewContainer.innerHTML = "";
      return;
    }
    this.previewContainer.classList.remove("hidden");
    this.previewContainer.innerHTML = this.attachments
      .map(
        (attachment, index) =>
          `<div class="attachment-thumb">
            <img src="${attachment.dataUrl}" alt="${attachment.name}" />
            <button class="attachment-remove" data-remove-index="${index}" title="${t("chat.removeAttachment")}">×</button>
          </div>`
      )
      .join("");
    this.previewContainer.querySelectorAll(".attachment-remove").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number((button as HTMLElement).dataset.removeIndex);
        this.attachments.splice(index, 1);
        this.renderPreview();
      });
    });
  }

  getAttachmentPaths(): string[] {
    return this.attachments.map((attachment) => attachment.path);
  }

  clear(): void {
    this.attachments = [];
    this.renderPreview();
  }
}
