import * as fs from "fs";
import * as path from "path";
import { ensurePerceptorIgnored } from "../../core/ensurePerceptorIgnored";
import { CodingPreferences } from "../types";

// Berkcan's house style is the out-of-the-box default; the form only edits deltas.
export const DEFAULT_CODING_PREFERENCES: CodingPreferences = {
  primaryLanguage: "typescript",
  preferredFramework: "",
  naming: {
    classCase: "PascalCase",
    methodCase: "camelCase",
    variableCase: "camelCase",
    constantCase: "UPPER_SNAKE_CASE",
    fileNaming: "PascalCase for classes, camelCase for utilities",
    booleanPrefixes: ["is", "has", "can"],
    testPattern: "should_{expected}_when_{condition}",
    allowAbbreviations: false,
  },
  architecture: {
    dependencyInjection: "constructor",
    layering: ["controller", "service", "repository", "model"],
    packaging: "feature",
    patterns: ["Strategy over boolean flags", "Repository", "Command", "Template Method"],
    errorHandling: "throw-domain-exception",
  },
  qualityGates: {
    maxTimeComplexity: "O(n)",
    forbidNPlusOneQueries: true,
    requireImpactAnalysis: true,
    forbidCodeDuplication: true,
    maxMethodLines: 30,
    enforceSingleResponsibility: true,
  },
  commentsPolicy: "minimal-why-only",
};

// Reads/writes the per-repo coding standard (.perceptor/coding-preferences.json).
// Missing fields fall back to the defaults so older files stay forward-compatible.
export class CodingPreferencesStore {
  constructor(private readonly rootProvider: () => string) {}

  private file(): string {
    return path.join(this.rootProvider(), ".perceptor", "coding-preferences.json");
  }

  read(): CodingPreferences {
    const file = this.file();
    if (!fs.existsSync(file)) {
      return DEFAULT_CODING_PREFERENCES;
    }
    try {
      const stored = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<CodingPreferences>;
      return this.withDefaults(stored);
    } catch {
      return DEFAULT_CODING_PREFERENCES;
    }
  }

  save(preferences: Partial<CodingPreferences>): CodingPreferences {
    const merged = this.withDefaults(preferences);
    const file = this.file();
    ensurePerceptorIgnored(this.rootProvider());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(merged, null, 2));
    return merged;
  }

  private withDefaults(stored: Partial<CodingPreferences>): CodingPreferences {
    const base = DEFAULT_CODING_PREFERENCES;
    return {
      primaryLanguage: stored.primaryLanguage ?? base.primaryLanguage,
      preferredFramework: stored.preferredFramework ?? base.preferredFramework,
      naming: { ...base.naming, ...stored.naming },
      architecture: { ...base.architecture, ...stored.architecture },
      qualityGates: { ...base.qualityGates, ...stored.qualityGates },
      commentsPolicy: stored.commentsPolicy ?? base.commentsPolicy,
    };
  }
}
