import type { FolderColor } from "../types";

// Semantic, ESLint-token-style neon palette: color reflects the architectural
// ROLE inferred from a folder/class name, so the same kind of code reads the
// same color everywhere (all services green, all repositories purple, …).
const ROLE_RULES: ReadonlyArray<{ color: string; test: RegExp }> = [
  { color: "#4cc2ff", test: /(controller|api|rest|endpoint|route|resource)s?$/i },
  { color: "#39d98a", test: /(service|usecase|interactor|application)s?$/i },
  { color: "#b388ff", test: /(repository|repositories|dao|store|persistence|mapper)s?$/i },
  { color: "#22d3ee", test: /(model|entity|entities|dto|domain|schema|record|pojo|vo)s?$/i },
  { color: "#ff5d8f", test: /(exception|error|fault|failure)s?$/i },
  { color: "#ffae3b", test: /(config|configuration|setting|option|env)s?$/i },
  { color: "#ff6ad5", test: /(event|handler|listener|subscriber|publisher|messaging|consumer)s?$/i },
  { color: "#818cf8", test: /(middleware|guard|filter|interceptor|pipe|decorator)s?$/i },
  { color: "#2dd4bf", test: /(test|spec|mock|fixture|e2e)s?$/i },
  { color: "#ffe14d", test: /(util|utils|helper|common|shared|lib|core|infra)s?$/i },
];
const NEUTRAL_ROLE_COLOR = "#7c8497";

export function roleColorHex(name: string): string {
  for (const rule of ROLE_RULES) {
    if (rule.test.test(name)) {
      return rule.color;
    }
  }
  return NEUTRAL_ROLE_COLOR;
}

export function folderColor(name: string): FolderColor {
  const hex = roleColorHex(name || "");
  return { accent: hex, stroke: hex, fill: hex };
}
