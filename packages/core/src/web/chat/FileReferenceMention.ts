import { escapeHtml } from "../dom";
import type { Api } from "../api/ApiClient";
import type { Graph } from "../types";

const MAX_VISIBLE_ITEMS = 8;

export class FileReferenceMention {
  private readonly menu: HTMLElement;
  private files: string[] = [];
  private filtered: string[] = [];
  private selectedIndex = 0;
  private isVisible = false;
  private loaded = false;
  private triggerIndex = -1;

  constructor(
    private readonly input: HTMLTextAreaElement,
    private readonly api: Api
  ) {
    this.menu = document.createElement("div");
    this.menu.className = "file-mention-menu hidden";
    input.parentElement!.style.position = "relative";
    input.parentElement!.appendChild(this.menu);
  }

  async handleInput(): Promise<void> {
    const cursorPos = this.input.selectionStart ?? 0;
    const textBeforeCursor = this.input.value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex === -1) {
      this.hide();
      return;
    }

    const afterAt = textBeforeCursor.slice(atIndex + 1);
    if (afterAt.includes(" ") || afterAt.includes("\n")) {
      this.hide();
      return;
    }

    // Ensure @ is at start or preceded by whitespace
    if (atIndex > 0 && !/\s/.test(textBeforeCursor[atIndex - 1]!)) {
      this.hide();
      return;
    }

    await this.loadFiles();

    const query = afterAt.toLowerCase();
    this.triggerIndex = atIndex;
    this.filtered = this.files
      .filter((file) => file.toLowerCase().includes(query))
      .slice(0, MAX_VISIBLE_ITEMS);

    if (this.filtered.length === 0) {
      this.hide();
      return;
    }
    this.selectedIndex = Math.min(this.selectedIndex, this.filtered.length - 1);
    this.show();
  }

  handleKeydown(event: KeyboardEvent): boolean {
    if (!this.isVisible) {
      return false;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
        this.render();
        return true;
      case "ArrowUp":
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.render();
        return true;
      case "Tab":
      case "Enter":
        event.preventDefault();
        this.selectCurrent();
        return true;
      case "Escape":
        event.preventDefault();
        this.hide();
        return true;
      default:
        return false;
    }
  }

  private async loadFiles(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      const graph: Graph | null = await this.api.graph();
      if (!graph) {
        return;
      }
      const uniqueFiles = new Set<string>();
      for (const node of graph.nodes) {
        uniqueFiles.add(node.file);
      }
      this.files = [...uniqueFiles].sort();
      this.loaded = true;
    } catch {
      // keep empty on failure
    }
  }

  reloadOnNextTrigger(): void {
    this.loaded = false;
  }

  private selectCurrent(): void {
    const file = this.filtered[this.selectedIndex];
    if (!file) {
      return;
    }
    const text = this.input.value;
    const cursorPos = this.input.selectionStart ?? 0;
    const before = text.slice(0, this.triggerIndex);
    const after = text.slice(cursorPos);
    const inserted = `@${file} `;
    this.input.value = `${before}${inserted}${after}`;
    const newCursor = before.length + inserted.length;
    this.input.setSelectionRange(newCursor, newCursor);
    this.hide();
    this.input.focus();
    this.input.dispatchEvent(new Event("input"));
  }

  private show(): void {
    this.isVisible = true;
    this.render();
    this.menu.classList.remove("hidden");
  }

  hide(): void {
    this.isVisible = false;
    this.menu.classList.add("hidden");
  }

  private render(): void {
    this.menu.innerHTML = this.filtered
      .map((file, index) => {
        const active = index === this.selectedIndex ? " file-mention-item-active" : "";
        const fileName = file.split("/").pop() ?? file;
        const dir = file.slice(0, file.length - fileName.length);
        return `<div class="file-mention-item${active}" data-file-index="${index}">
          <span class="file-mention-icon">$(file)</span>
          <span class="file-mention-name">${escapeHtml(fileName)}</span>
          <span class="file-mention-path">${escapeHtml(dir)}</span>
        </div>`;
      })
      .join("");
    this.menu.querySelectorAll(".file-mention-item").forEach((item) => {
      item.addEventListener("click", () => {
        const index = Number((item as HTMLElement).dataset.fileIndex);
        this.selectedIndex = index;
        this.selectCurrent();
      });
    });
  }
}
