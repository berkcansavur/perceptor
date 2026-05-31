// Domain model for the dependency/behavior graph. Everything is readonly and
// fully typed — no implicit any, no undefined leaks.

export type Visibility = "public" | "protected" | "private" | "internal" | "package";
export type DependencySource = "constructor" | "field";
export type ClassKind =
  | "class"
  | "interface"
  | "enum"
  | "record"
  | "struct"
  | "type"
  | "const"
  | "annotation"
  | "delegate"
  // File-level nodes so every file appears in the map, not just classes:
  | "module" // a code file that declares no class (top-level functions only)
  | "config" // a recognised config file (package.json, Dockerfile, …)
  | "file"; // any other file (assets, docs, lock files)

export type Parameter = {
  readonly name: string;
  readonly type: string;
};

export type Dependency = Parameter & {
  readonly baseType: string | null;
  readonly source: DependencySource;
};

export type Behavior = {
  readonly name: string;
  readonly visibility: Visibility;
  readonly isStatic: boolean;
  readonly returnType: string;
  readonly params: readonly Parameter[];
  readonly line: number;
  readonly endLine: number;
};

// A class/interface/enum as produced by a language extractor (no graph identity yet).
export type ParsedClass = {
  readonly name: string;
  readonly kind: ClassKind;
  readonly file: string;
  readonly line: number;
  readonly dependencies: readonly Dependency[];
  readonly behaviors: readonly Behavior[];
};

// A ParsedClass placed in the graph (with id + location metadata).
export type ClassNode = ParsedClass & {
  readonly id: string;
  readonly language: string;
  readonly dir: string;
  readonly folder: string;
};

export type Edge = {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: DependencySource;
};

export type GraphStats = {
  readonly files: number;
  readonly classes: number;
  readonly edges: number;
  readonly byLanguage: Readonly<Record<string, number>>;
};

export type Graph = {
  readonly generatedAt: string;
  readonly root: string;
  readonly stats: GraphStats;
  readonly nodes: readonly ClassNode[];
  readonly edges: readonly Edge[];
  readonly directories: readonly string[];
};

// Structural view of a tree-sitter node — only what the extractors need
// (Interface Segregation), so the core doesn't couple to web-tree-sitter's types.
export interface TsNode {
  readonly type: string;
  readonly text: string;
  readonly isNamed: boolean;
  readonly parent: TsNode | null;
  readonly namedChildren: readonly TsNode[];
  readonly children: readonly TsNode[];
  readonly startPosition: { readonly row: number; readonly column: number };
  readonly endPosition: { readonly row: number; readonly column: number };
  childForFieldName(field: string): TsNode | null;
}

// A language the analyzer can parse.
export type LanguageDefinition = {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly wasmPath: string;
  readonly extractor: LanguageExtractor;
};

// Strategy that turns a parsed AST into classes for one language family.
export interface LanguageExtractor {
  extract(rootNode: TsNode, relativeFile: string): readonly ParsedClass[];
  // Top-level functions of a class-less file, surfaced as a "module" node's behaviors.
  topLevelBehaviors?(rootNode: TsNode, relativeFile: string): readonly Behavior[];
}

// Strategy that turns a non-code file into graph nodes from its raw text, so the
// map can show config/asset/doc files. First matching extractor wins (Open/Closed).
export interface FileNodeExtractor {
  matches(fileName: string): boolean;
  extract(fileName: string, content: string, relativeFile: string): readonly ParsedClass[];
}
