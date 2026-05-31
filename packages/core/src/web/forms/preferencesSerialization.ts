import type { CodingPreferences, PreferredLanguage } from "../types";

const PREFERRED_LANGUAGES: readonly PreferredLanguage[] = ["typescript", "java", "csharp"];
const FALLBACK_MAX_METHOD_LINES = 30;

// Plain (DOM-free) snapshot of the form so the build step stays pure and testable;
// PreferencesForm reads the inputs into this and renders it back.
export type RawPreferenceInputs = {
  primaryLanguage: string;
  additionalLanguages: string[];
  classCase: string;
  methodCase: string;
  variableCase: string;
  constantCase: string;
  fileNaming: string;
  booleanPrefixes: string;
  testPattern: string;
  allowAbbreviations: boolean;
  dependencyInjection: string;
  layering: string;
  packaging: string;
  patterns: string;
  errorHandling: string;
  maxTimeComplexity: string;
  maxMethodLines: string;
  forbidNPlusOneQueries: boolean;
  requireImpactAnalysis: boolean;
  forbidCodeDuplication: boolean;
  enforceSingleResponsibility: boolean;
  commentsPolicy: string;
}

export function splitList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function joinList(items: string[]): string {
  return items.join(", ");
}

export function toPreferredLanguage(value: string): PreferredLanguage {
  return PREFERRED_LANGUAGES.includes(value as PreferredLanguage)
    ? (value as PreferredLanguage)
    : "typescript";
}

export function buildPreferences(raw: RawPreferenceInputs): CodingPreferences {
  const primaryLanguage = toPreferredLanguage(raw.primaryLanguage);
  const additionalLanguages = [...new Set(raw.additionalLanguages.map(toPreferredLanguage))].filter(
    (language) => language !== primaryLanguage
  );
  return {
    primaryLanguage,
    additionalLanguages,
    naming: {
      classCase: raw.classCase,
      methodCase: raw.methodCase,
      variableCase: raw.variableCase,
      constantCase: raw.constantCase,
      fileNaming: raw.fileNaming,
      booleanPrefixes: splitList(raw.booleanPrefixes),
      testPattern: raw.testPattern,
      allowAbbreviations: raw.allowAbbreviations,
    },
    architecture: {
      dependencyInjection: raw.dependencyInjection,
      layering: splitList(raw.layering),
      packaging: raw.packaging,
      patterns: splitList(raw.patterns),
      errorHandling: raw.errorHandling,
    },
    qualityGates: {
      maxTimeComplexity: raw.maxTimeComplexity,
      forbidNPlusOneQueries: raw.forbidNPlusOneQueries,
      requireImpactAnalysis: raw.requireImpactAnalysis,
      forbidCodeDuplication: raw.forbidCodeDuplication,
      maxMethodLines: toPositiveInt(raw.maxMethodLines, FALLBACK_MAX_METHOD_LINES),
      enforceSingleResponsibility: raw.enforceSingleResponsibility,
    },
    commentsPolicy: raw.commentsPolicy,
  };
}

function toPositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
