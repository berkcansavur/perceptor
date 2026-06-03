import { escapeHtml } from "../dom";
import type { Api } from "../api/ApiClient";

type SlashSkill = {
  name: string;
  label: string;
  description: string;
};

export class SlashCommandMenu {
  private readonly menu: HTMLElement;
  private skills: SlashSkill[] = [];
  private filtered: SlashSkill[] = [];
  private selectedIndex = 0;
  private isVisible = false;
  private loaded = false;

  constructor(
    private readonly input: HTMLTextAreaElement,
    private readonly api: Api,
    private readonly onSelect: (command: string) => void
  ) {
    this.menu = document.createElement("div");
    this.menu.className = "slash-menu hidden";
    input.parentElement!.style.position = "relative";
    input.parentElement!.appendChild(this.menu);
  }

  async handleInput(): Promise<void> {
    const text = this.input.value;
    if (!text.startsWith("/")) {
      this.hide();
      return;
    }
    await this.loadSkills();
    const query = text.slice(1).toLowerCase().split(" ")[0] ?? "";
    this.filtered = this.skills.filter(
      (skill) => skill.name.includes(query)
    );
    if (this.filtered.length === 0) {
      this.hide();
      return;
    }
    this.selectedIndex = Math.min(this.selectedIndex, this.filtered.length - 1);
    this.show();
  }

  handleKeydown(event: KeyboardEvent): boolean {
    if (!this.isVisible) return false;
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

  private async loadSkills(): Promise<void> {
    if (this.loaded) return;
    try {
      const skills = await this.api.listSkills();
      this.skills = skills.map((skill) => ({
        name: skill.name,
        label: `/${skill.name}`,
        description: skill.description,
      }));
      this.loaded = true;
    } catch {
      // keep empty on failure
    }
  }

  private selectCurrent(): void {
    const skill = this.filtered[this.selectedIndex];
    if (!skill) return;
    this.input.value = `/${skill.name} `;
    this.hide();
    this.onSelect(skill.name);
    this.input.focus();
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
      .map((skill, index) => {
        const active = index === this.selectedIndex ? " slash-item-active" : "";
        return `<div class="slash-item${active}" data-slash-index="${index}">
          <span class="slash-name">${escapeHtml(skill.label)}</span>
          <span class="slash-desc">${escapeHtml(skill.description)}</span>
        </div>`;
      })
      .join("");
    this.menu.querySelectorAll(".slash-item").forEach((item) => {
      item.addEventListener("click", () => {
        const index = Number((item as HTMLElement).dataset.slashIndex);
        this.selectedIndex = index;
        this.selectCurrent();
      });
    });
  }
}
