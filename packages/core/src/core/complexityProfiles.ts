import * as path from "path";

// Per-language complexity profiles. The structural mechanics of counting nesting are shared
// (braces, parenthesised headers, do/while), but *which* tokens open a loop and *which*
// method calls iterate once-per-element are language-specific — JS array methods, Java
// Stream operations, and C# LINQ + the `foreach` keyword. A profile supplies exactly those
// three vocabularies; everything else in the analyzer is language-agnostic syntax.
export interface ComplexityProfile {
  // Keywords whose body follows a parenthesised header: `for (…) body`, `while (…) body`,
  // and — only in C# — `foreach (…) body`. Each contributes one loop level.
  readonly headerLoops: ReadonlySet<string>;
  // Method names whose callback/clause runs once per element, i.e. a loop over a receiver
  // (`xs.map(fn)`, `xs.Where(p)`, `stream.forEach(fn)`).
  readonly iterators: ReadonlySet<string>;
  // Branch tokens counted toward cyclomatic complexity (one decision point each).
  readonly branchKeywords: ReadonlySet<string>;
}

// JavaScript / TypeScript: Array & iterable methods whose callback runs per element. This
// is the historical default — the analyzer's behavior when no language is known.
const TS_ITERATORS = [
  "forEach",
  "map",
  "filter",
  "reduce",
  "reduceRight",
  "some",
  "every",
  "find",
  "findIndex",
  "flatMap",
] as const;

const TS_PROFILE: ComplexityProfile = {
  headerLoops: new Set(["for", "while"]),
  iterators: new Set(TS_ITERATORS),
  branchKeywords: new Set(["if", "for", "while", "case", "catch"]),
};

// Java: enhanced-for and while are plain `for`/`while`. The per-element work lives in
// Stream pipeline operations, whose names overlap with JS (map/filter/forEach/reduce) plus
// the primitive-stream and matching variants.
const JAVA_PROFILE: ComplexityProfile = {
  headerLoops: new Set(["for", "while"]),
  iterators: new Set([
    "forEach",
    "forEachOrdered",
    "map",
    "mapToInt",
    "mapToLong",
    "mapToDouble",
    "mapToObj",
    "filter",
    "reduce",
    "flatMap",
    "anyMatch",
    "allMatch",
    "noneMatch",
    "peek",
  ]),
  branchKeywords: new Set(["if", "for", "while", "case", "catch"]),
};

// C#: `foreach` is a first-class loop keyword with a parenthesised header (so it slots into
// the same header-loop mechanics as for/while). Per-element work also lives in LINQ
// operators, which take a delegate and run it once per element.
const CSHARP_PROFILE: ComplexityProfile = {
  headerLoops: new Set(["for", "foreach", "while"]),
  iterators: new Set([
    "Select",
    "SelectMany",
    "Where",
    "Aggregate",
    "ForEach",
    "Any",
    "All",
    "First",
    "FirstOrDefault",
    "Last",
    "LastOrDefault",
    "Single",
    "SingleOrDefault",
    "Count",
    "OrderBy",
    "OrderByDescending",
    "ThenBy",
    "ThenByDescending",
    "GroupBy",
    "TakeWhile",
    "SkipWhile",
  ]),
  branchKeywords: new Set(["if", "for", "foreach", "while", "case", "catch"]),
};

const PROFILE_BY_EXTENSION: Record<string, ComplexityProfile> = {
  ".cs": CSHARP_PROFILE,
  ".java": JAVA_PROFILE,
  ".ts": TS_PROFILE,
  ".tsx": TS_PROFILE,
  ".mts": TS_PROFILE,
  ".cts": TS_PROFILE,
  ".js": TS_PROFILE,
  ".jsx": TS_PROFILE,
  ".mjs": TS_PROFILE,
  ".cjs": TS_PROFILE,
};

export const DEFAULT_COMPLEXITY_PROFILE = TS_PROFILE;

// Resolve a profile from a file path. Unknown/absent extensions fall back to the TS/JS
// profile so the analyzer degrades to its historical, language-agnostic behavior.
export function profileForFile(filePath?: string): ComplexityProfile {
  if (!filePath) {
    return DEFAULT_COMPLEXITY_PROFILE;
  }
  return PROFILE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? DEFAULT_COMPLEXITY_PROFILE;
}
