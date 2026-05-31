import { CodingPreferencesStore } from "./persistence/CodingPreferencesStore";
import { BehaviorSummaryStore } from "./persistence/BehaviorSummaryStore";
import { LocaleStore } from "./persistence/LocaleStore";
import type { BehaviorSummary, CodingPreferences } from "./types";

// Per-repo settings: the coding standard Claude obeys, the UI locale, and cached behavior
// summaries. Owns the three persistence stores. `locale()` is read by other services (meta,
// stop message) via an injected provider, so the locale has a single owner.
export class PreferencesService {
  private readonly preferences: CodingPreferencesStore;
  private readonly behaviorSummaries: BehaviorSummaryStore;
  private readonly localeStore: LocaleStore;

  constructor(rootProvider: () => string) {
    this.preferences = new CodingPreferencesStore(rootProvider);
    this.behaviorSummaries = new BehaviorSummaryStore(rootProvider);
    this.localeStore = new LocaleStore(rootProvider);
  }

  locale(): string {
    return this.localeStore.read();
  }

  setLocale(locale: string): { locale: string } {
    return { locale: this.localeStore.save(locale) };
  }

  getPreferences(): { preferences: CodingPreferences } {
    return { preferences: this.preferences.read() };
  }

  savePreferences(payload: CodingPreferences): { preferences: CodingPreferences } {
    return { preferences: this.preferences.save(payload) };
  }

  behaviorSummary(file: string, behavior: string): { summary: BehaviorSummary | null } {
    return { summary: this.behaviorSummaries.read(file, behavior) };
  }
}
