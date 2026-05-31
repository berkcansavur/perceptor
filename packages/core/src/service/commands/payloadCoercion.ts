import { CodingPreferences, EnqueuePayload, PreferredLanguage, TaskImpact, TaskStatus, UpdatePayload } from "../types";
import { coerceKind } from "../task/taskCoercion";
import { DEFAULT_CODING_PREFERENCES } from "../persistence/CodingPreferencesStore";

// Boundary coercion: the webview RPC hands us untyped records, so here — and only
// here — we turn them into complete, typed domain payloads.

const PREFERRED_LANGUAGES: readonly PreferredLanguage[] = ["typescript", "java", "csharp"];

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function asLanguage(value: unknown, fallback: PreferredLanguage): PreferredLanguage {
  const text = asString(value);
  return text !== null && PREFERRED_LANGUAGES.includes(text as PreferredLanguage) ? (text as PreferredLanguage) : fallback;
}

function toImpact(value: unknown): TaskImpact | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return { risk: asString(record["risk"]) ?? "", notes: asStringList(record["notes"]) };
}

export function toEnqueuePayload(payload: Record<string, unknown>): EnqueuePayload {
  return coerceKind(payload["type"], payload["from"], payload["to"], payload["spec"]);
}

export function toUpdatePayload(payload: Record<string, unknown>): UpdatePayload {
  return {
    id: asString(payload["id"]) ?? "",
    status: asString(payload["status"]) as TaskStatus | null,
    message: asString(payload["message"]),
    diff: asString(payload["diff"]),
    role: asString(payload["role"]),
    commitMessage: asString(payload["commitMessage"]),
    impact: toImpact(payload["impact"]),
    dismissed: typeof payload["dismissed"] === "boolean" ? (payload["dismissed"] as boolean) : null,
  };
}

// Reconstruct a complete CodingPreferences from the raw record, falling back to the house
// defaults field by field — so the parsed value is fully typed, never a Partial bag.
export function toCodingPreferences(payload: Record<string, unknown>): CodingPreferences {
  const defaults = DEFAULT_CODING_PREFERENCES;
  const naming = asRecord(payload["naming"]) ?? {};
  const architecture = asRecord(payload["architecture"]) ?? {};
  const qualityGates = asRecord(payload["qualityGates"]) ?? {};
  const primaryLanguage = asLanguage(payload["primaryLanguage"], defaults.primaryLanguage);
  return {
    primaryLanguage,
    additionalLanguages: toAdditionalLanguages(payload["additionalLanguages"], primaryLanguage),
    naming: {
      classCase: asString(naming["classCase"]) ?? defaults.naming.classCase,
      methodCase: asString(naming["methodCase"]) ?? defaults.naming.methodCase,
      variableCase: asString(naming["variableCase"]) ?? defaults.naming.variableCase,
      constantCase: asString(naming["constantCase"]) ?? defaults.naming.constantCase,
      fileNaming: asString(naming["fileNaming"]) ?? defaults.naming.fileNaming,
      booleanPrefixes: asStringList(naming["booleanPrefixes"]),
      testPattern: asString(naming["testPattern"]) ?? defaults.naming.testPattern,
      allowAbbreviations: asBoolean(naming["allowAbbreviations"], defaults.naming.allowAbbreviations),
    },
    architecture: {
      dependencyInjection: asString(architecture["dependencyInjection"]) ?? defaults.architecture.dependencyInjection,
      layering: asStringList(architecture["layering"]),
      packaging: asString(architecture["packaging"]) ?? defaults.architecture.packaging,
      patterns: asStringList(architecture["patterns"]),
      errorHandling: asString(architecture["errorHandling"]) ?? defaults.architecture.errorHandling,
    },
    qualityGates: {
      maxTimeComplexity: asString(qualityGates["maxTimeComplexity"]) ?? defaults.qualityGates.maxTimeComplexity,
      forbidNPlusOneQueries: asBoolean(qualityGates["forbidNPlusOneQueries"], defaults.qualityGates.forbidNPlusOneQueries),
      requireImpactAnalysis: asBoolean(qualityGates["requireImpactAnalysis"], defaults.qualityGates.requireImpactAnalysis),
      forbidCodeDuplication: asBoolean(qualityGates["forbidCodeDuplication"], defaults.qualityGates.forbidCodeDuplication),
      maxMethodLines: asNumber(qualityGates["maxMethodLines"], defaults.qualityGates.maxMethodLines),
      enforceSingleResponsibility: asBoolean(qualityGates["enforceSingleResponsibility"], defaults.qualityGates.enforceSingleResponsibility),
    },
    commentsPolicy: asString(payload["commentsPolicy"]) ?? defaults.commentsPolicy,
  };
}

function toAdditionalLanguages(value: unknown, primaryLanguage: PreferredLanguage): PreferredLanguage[] {
  const languages = asStringList(value)
    .map((item) => asLanguage(item, primaryLanguage))
    .filter((language) => language !== primaryLanguage);
  return [...new Set(languages)];
}
