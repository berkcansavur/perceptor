import * as fs from "fs";
import * as path from "path";
import { ensurePerceptorIgnored } from "../../core/ensurePerceptorIgnored";

export type Locale = "en" | "tr";

const DEFAULT_LOCALE: Locale = "en";

// The app locale, persisted to .perceptor/locale.json so it's a single source of
// truth: the UI chrome and Claude's generated text (messages, summaries, commit
// messages) all follow it — never a mix of languages.
export class LocaleStore {
  constructor(private readonly rootProvider: () => string) {}

  private file(): string {
    return path.join(this.rootProvider(), ".perceptor", "locale.json");
  }

  read(): Locale {
    const file = this.file();
    if (!fs.existsSync(file)) {
      return DEFAULT_LOCALE;
    }
    try {
      const stored = JSON.parse(fs.readFileSync(file, "utf8")) as { locale?: string };
      return this.normalize(stored.locale);
    } catch {
      return DEFAULT_LOCALE;
    }
  }

  save(locale: string): Locale {
    const normalized = this.normalize(locale);
    const file = this.file();
    ensurePerceptorIgnored(this.rootProvider());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ locale: normalized }, null, 2));
    return normalized;
  }

  private normalize(locale: string | undefined): Locale {
    return locale === "tr" ? "tr" : "en";
  }
}
