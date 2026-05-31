import { CodingPreferences, EnqueuePayload, PreferredLanguage, TaskStatus, UpdatePayload } from "../types";
import { coerceKind } from "../task/taskCoercion";
import { DEFAULT_CODING_PREFERENCES } from "../persistence/CodingPreferencesStore";
import { UnsupportedActionException } from "../exception";

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

export function toEnqueuePayload(payload: Record<string, unknown>): EnqueuePayload {
  return coerceKind(payload["type"], payload["from"], payload["to"], payload["spec"]);
}

// The webview tags each update with its `intent`; parse it into the matching union member
// so the store switches on a real discriminant, never sniffs which nullable field is set.
export function toUpdatePayload(payload: Record<string, unknown>): UpdatePayload {
  const id = asString(payload["id"]) ?? "";
  const intent = asString(payload["intent"]);
  switch (intent) {
    case "set-status":
      return { id, intent: "set-status", status: (asString(payload["status"]) ?? "pending") as TaskStatus };
    case "reply":
      return { id, intent: "reply", message: asString(payload["message"]) ?? "" };
    case "dismiss":
      return { id, intent: "dismiss" };
    default:
      throw new UnsupportedActionException(`updateTask:${intent ?? "unknown"}`);
  }
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
