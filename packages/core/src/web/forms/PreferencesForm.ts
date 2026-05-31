import type { Api } from "../api/ApiClient";
import type { Emitter } from "../Emitter";
import type { CodingPreferences, PreferredLanguage } from "../types";
import { byId } from "../dom";
import { t } from "../i18n";
import { buildPreferences, joinList, type RawPreferenceInputs } from "./preferencesSerialization";

// The Coding Preferences dialog: loads the per-repo standard, lets the user edit
// every field, and persists it so Claude generates code that matches the repo.
export class PreferencesForm {
  private readonly modal = byId("prefs-modal");

  constructor(
    private readonly api: Api,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    byId("prefs-btn").addEventListener("click", () => void this.open());
    byId("prefs-cancel").addEventListener("click", () => this.close());
    byId("prefs-save").addEventListener("click", () => void this.save());
    this.modal.addEventListener("mousedown", (event) => {
      if (event.target === this.modal) {
        this.close();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.modal.classList.contains("hidden")) {
        this.close();
      }
    });
  }

  private async open(): Promise<void> {
    try {
      this.fill(await this.api.getPreferences());
    } catch {
      return;
    }
    byId("prefs-error").classList.add("hidden");
    this.modal.classList.remove("hidden");
  }

  private close(): void {
    this.modal.classList.add("hidden");
  }

  private async save(): Promise<void> {
    const preferences = buildPreferences(this.read());
    await this.api.savePreferences(preferences);
    this.bus.emit("toast", t("prefs.saved"));
    this.close();
  }

  private fill(preferences: CodingPreferences): void {
    this.select("prefs-primary-language").value = preferences.primaryLanguage;
    this.setLanguageCheck("typescript", preferences.additionalLanguages);
    this.setLanguageCheck("java", preferences.additionalLanguages);
    this.setLanguageCheck("csharp", preferences.additionalLanguages);

    this.input("prefs-class-case").value = preferences.naming.classCase;
    this.input("prefs-method-case").value = preferences.naming.methodCase;
    this.input("prefs-variable-case").value = preferences.naming.variableCase;
    this.input("prefs-constant-case").value = preferences.naming.constantCase;
    this.input("prefs-file-naming").value = preferences.naming.fileNaming;
    this.input("prefs-boolean-prefixes").value = joinList(preferences.naming.booleanPrefixes);
    this.input("prefs-test-pattern").value = preferences.naming.testPattern;
    this.input("prefs-allow-abbreviations").checked = preferences.naming.allowAbbreviations;

    this.input("prefs-di").value = preferences.architecture.dependencyInjection;
    this.input("prefs-layering").value = joinList(preferences.architecture.layering);
    this.select("prefs-packaging").value = preferences.architecture.packaging;
    this.input("prefs-patterns").value = joinList(preferences.architecture.patterns);
    this.select("prefs-error-handling").value = preferences.architecture.errorHandling;

    this.select("prefs-max-complexity").value = preferences.qualityGates.maxTimeComplexity;
    this.input("prefs-max-method-lines").value = String(preferences.qualityGates.maxMethodLines);
    this.input("prefs-forbid-nplus1").checked = preferences.qualityGates.forbidNPlusOneQueries;
    this.input("prefs-require-impact").checked = preferences.qualityGates.requireImpactAnalysis;
    this.input("prefs-forbid-duplication").checked = preferences.qualityGates.forbidCodeDuplication;
    this.input("prefs-single-responsibility").checked =
      preferences.qualityGates.enforceSingleResponsibility;

    this.select("prefs-comments").value = preferences.commentsPolicy;
  }

  private read(): RawPreferenceInputs {
    return {
      primaryLanguage: this.select("prefs-primary-language").value,
      additionalLanguages: this.checkedLanguages(),
      classCase: this.input("prefs-class-case").value,
      methodCase: this.input("prefs-method-case").value,
      variableCase: this.input("prefs-variable-case").value,
      constantCase: this.input("prefs-constant-case").value,
      fileNaming: this.input("prefs-file-naming").value,
      booleanPrefixes: this.input("prefs-boolean-prefixes").value,
      testPattern: this.input("prefs-test-pattern").value,
      allowAbbreviations: this.input("prefs-allow-abbreviations").checked,
      dependencyInjection: this.input("prefs-di").value,
      layering: this.input("prefs-layering").value,
      packaging: this.select("prefs-packaging").value,
      patterns: this.input("prefs-patterns").value,
      errorHandling: this.select("prefs-error-handling").value,
      maxTimeComplexity: this.select("prefs-max-complexity").value,
      maxMethodLines: this.input("prefs-max-method-lines").value,
      forbidNPlusOneQueries: this.input("prefs-forbid-nplus1").checked,
      requireImpactAnalysis: this.input("prefs-require-impact").checked,
      forbidCodeDuplication: this.input("prefs-forbid-duplication").checked,
      enforceSingleResponsibility: this.input("prefs-single-responsibility").checked,
      commentsPolicy: this.select("prefs-comments").value,
    };
  }

  private checkedLanguages(): PreferredLanguage[] {
    const languages: PreferredLanguage[] = ["typescript", "java", "csharp"];
    return languages.filter((language) => this.input(`prefs-lang-${language}`).checked);
  }

  private setLanguageCheck(language: PreferredLanguage, additional: readonly PreferredLanguage[]): void {
    this.input(`prefs-lang-${language}`).checked = additional.includes(language);
  }

  private input(id: string): HTMLInputElement {
    return byId<HTMLInputElement>(id);
  }

  private select(id: string): HTMLSelectElement {
    return byId<HTMLSelectElement>(id);
  }
}
