import type { AppState } from "../state/AppState";
import type { Emitter } from "../events";
import { byId } from "../dom";
import { getCurrentLang, setLang } from "../i18n";

// Top toolbar: mode switch, search, relayout and language selector.
export class Toolbar {
  private readonly search = byId<HTMLInputElement>("search");

  constructor(
    private readonly state: AppState,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    byId("mode-graph").addEventListener("click", () => this.bus.emit("mode:set", "graph"));
    byId("mode-folder").addEventListener("click", () => this.bus.emit("mode:set", "folder"));
    byId("relayout").addEventListener("click", () => this.bus.emit("graph:relayout", undefined));

    this.search.addEventListener("input", () => {
      this.state.searchQuery = this.search.value.trim().toLowerCase();
      this.bus.emit("search:changed", undefined);
    });

    const langSelect = byId<HTMLSelectElement>("lang-select");
    langSelect.value = getCurrentLang();
    langSelect.addEventListener("change", () => setLang(langSelect.value));
  }
}
