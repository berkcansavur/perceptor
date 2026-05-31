import * as fs from "fs";
import * as path from "path";
import { ScaffoldRequest } from "../types";

const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
]);

const EXTENSION_FAMILY: Readonly<Record<string, string>> = {
  ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".cs": "csharp",
  ".java": "java",
  ".kt": "kotlin", ".kts": "kotlin",
  ".py": "python", ".pyw": "python",
  ".go": "go",
  ".rb": "ruby",
  ".php": "php",
  ".rs": "rust",
  ".swift": "swift",
  ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp",
  ".c": "c", ".h": "c",
  ".css": "css", ".scss": "css", ".sass": "css", ".less": "css",
  ".html": "html", ".htm": "html",
  ".vue": "vue",
  ".svelte": "svelte",
  ".yml": "yaml", ".yaml": "yaml",
  ".json": "json",
  ".md": "markdown", ".markdown": "markdown",
  ".sql": "sql",
  ".sh": "shell", ".bash": "shell", ".zsh": "shell",
  ".xml": "xml",
  ".toml": "toml",
};

type ScaffoldContext = {
  readonly typeName: string;
  readonly namespace: string;
  readonly goPackage: string;
  readonly absoluteDir: string;
  readonly fileName: string;
}

// Strategy per file family (Open/Closed: add a language = add an entry).
type LanguageTemplates = {
  readonly templates: readonly string[];
  generate(template: string, context: ScaffoldContext): string;
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function namespaceForDir(dir: string): string {
  return dir
    .split("/")
    .filter(Boolean)
    .filter((segment) => !["src", "main", "java", "kotlin", "csharp"].includes(segment))
    .join(".");
}

function goPackageForDir(dir: string): string {
  const segments = dir.split("/").filter(Boolean);
  return segments.length > 0 ? (segments[segments.length - 1] as string) : "main";
}

function barrelExports(absoluteDir: string, fileName: string): string {
  let siblings: fs.Dirent[];
  try {
    siblings = fs.readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return "";
  }
  const self = fileName.toLowerCase();
  const modules = siblings
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => {
      if (!CODE_EXTENSIONS.has(path.extname(name).toLowerCase())) return false;
      if (name.toLowerCase() === self) return false;
      if (name.endsWith(".d.ts")) return false;
      if (baseName(name).toLowerCase() === "index") return false;
      return true;
    })
    .map((name) => baseName(name))
    .sort((a, b) => a.localeCompare(b));
  return modules.map((module) => `export * from "./${module}";`).join("\n") + (modules.length > 0 ? "\n" : "");
}

function lang(templates: readonly string[], generate: LanguageTemplates["generate"]): LanguageTemplates {
  return { templates, generate };
}

const EMPTY = lang(["empty"], () => "");

const REGISTRY: Readonly<Record<string, LanguageTemplates>> = {
  typescript: lang(["class", "abstract-class", "interface", "enum", "type", "barrel", "empty"], (template, c) => {
    switch (template) {
      case "class": return `export class ${c.typeName} {}\n`;
      case "abstract-class": return `export abstract class ${c.typeName} {}\n`;
      case "interface": return `export interface ${c.typeName} {}\n`;
      case "enum": return `export enum ${c.typeName} {\n}\n`;
      case "type": return `export type ${c.typeName} = {};\n`;
      case "barrel": return barrelExports(c.absoluteDir, c.fileName);
      default: return "";
    }
  }),
  javascript: lang(["class", "function", "barrel", "empty"], (template, c) => {
    switch (template) {
      case "class": return `export class ${c.typeName} {}\n`;
      case "function": return `export function ${c.typeName}() {}\n`;
      case "barrel": return barrelExports(c.absoluteDir, c.fileName);
      default: return "";
    }
  }),
  csharp: lang(["class", "abstract-class", "interface", "enum", "record", "empty"], (template, c) => {
    const header = c.namespace ? `namespace ${c.namespace};\n\n` : "";
    switch (template) {
      case "class": return `${header}public class ${c.typeName}\n{\n}\n`;
      case "abstract-class": return `${header}public abstract class ${c.typeName}\n{\n}\n`;
      case "interface": return `${header}public interface ${c.typeName}\n{\n}\n`;
      case "enum": return `${header}public enum ${c.typeName}\n{\n}\n`;
      case "record": return `${header}public record ${c.typeName}();\n`;
      default: return header;
    }
  }),
  java: lang(["class", "abstract-class", "interface", "enum", "record", "empty"], (template, c) => {
    const header = c.namespace ? `package ${c.namespace};\n\n` : "";
    switch (template) {
      case "class": return `${header}public class ${c.typeName} {\n}\n`;
      case "abstract-class": return `${header}public abstract class ${c.typeName} {\n}\n`;
      case "interface": return `${header}public interface ${c.typeName} {\n}\n`;
      case "enum": return `${header}public enum ${c.typeName} {\n}\n`;
      case "record": return `${header}public record ${c.typeName}() {\n}\n`;
      default: return header;
    }
  }),
  kotlin: lang(["class", "interface", "enum", "object", "empty"], (template, c) => {
    switch (template) {
      case "class": return `class ${c.typeName}\n`;
      case "interface": return `interface ${c.typeName}\n`;
      case "enum": return `enum class ${c.typeName} {\n}\n`;
      case "object": return `object ${c.typeName}\n`;
      default: return "";
    }
  }),
  python: lang(["class", "function", "empty"], (template, c) => {
    switch (template) {
      case "class": return `class ${c.typeName}:\n    pass\n`;
      case "function": return `def ${c.typeName}():\n    pass\n`;
      default: return "";
    }
  }),
  go: lang(["struct", "interface", "function", "empty"], (template, c) => {
    const header = `package ${c.goPackage}\n\n`;
    switch (template) {
      case "struct": return `${header}type ${c.typeName} struct {\n}\n`;
      case "interface": return `${header}type ${c.typeName} interface {\n}\n`;
      case "function": return `${header}func ${c.typeName}() {\n}\n`;
      default: return header;
    }
  }),
  ruby: lang(["class", "module", "empty"], (template, c) => {
    switch (template) {
      case "class": return `class ${c.typeName}\nend\n`;
      case "module": return `module ${c.typeName}\nend\n`;
      default: return "";
    }
  }),
  php: lang(["class", "interface", "enum", "empty"], (template, c) => {
    switch (template) {
      case "class": return `<?php\n\nclass ${c.typeName}\n{\n}\n`;
      case "interface": return `<?php\n\ninterface ${c.typeName}\n{\n}\n`;
      case "enum": return `<?php\n\nenum ${c.typeName}\n{\n}\n`;
      default: return "<?php\n";
    }
  }),
  rust: lang(["struct", "enum", "trait", "empty"], (template, c) => {
    switch (template) {
      case "struct": return `pub struct ${c.typeName} {}\n`;
      case "enum": return `pub enum ${c.typeName} {}\n`;
      case "trait": return `pub trait ${c.typeName} {}\n`;
      default: return "";
    }
  }),
  swift: lang(["class", "struct", "enum", "protocol", "empty"], (template, c) => {
    switch (template) {
      case "class": return `class ${c.typeName} {\n}\n`;
      case "struct": return `struct ${c.typeName} {\n}\n`;
      case "enum": return `enum ${c.typeName} {\n}\n`;
      case "protocol": return `protocol ${c.typeName} {\n}\n`;
      default: return "";
    }
  }),
  cpp: lang(["class", "struct", "empty"], (template, c) => {
    switch (template) {
      case "class": return `class ${c.typeName} {\n};\n`;
      case "struct": return `struct ${c.typeName} {\n};\n`;
      default: return "";
    }
  }),
  c: lang(["struct", "empty"], (template, c) =>
    template === "struct" ? `typedef struct ${c.typeName} {\n} ${c.typeName};\n` : ""
  ),
  css: EMPTY,
  html: lang(["doc", "empty"], (template) =>
    template === "doc"
      ? [
          "<!DOCTYPE html>",
          '<html lang="en">',
          "  <head>",
          '    <meta charset="UTF-8" />',
          "    <title></title>",
          "  </head>",
          "  <body></body>",
          "</html>",
          "",
        ].join("\n")
      : ""
  ),
  vue: lang(["sfc", "empty"], (template) =>
    template === "sfc"
      ? ["<template>", "  <div></div>", "</template>", "", "<script setup>", "</script>", ""].join("\n")
      : ""
  ),
  svelte: EMPTY,
  yaml: lang(["empty", "compose"], (template) =>
    template === "compose"
      ? ["services:", "  app:", "    build: .", "    ports:", '      - "3000:3000"', ""].join("\n")
      : ""
  ),
  json: lang(["empty"], () => "{}\n"),
  markdown: lang(["empty"], (_template, c) => `# ${c.typeName}\n`),
  sql: EMPTY,
  shell: lang(["script", "empty"], (template) =>
    template === "script" ? "#!/usr/bin/env bash\nset -euo pipefail\n\n" : ""
  ),
  xml: lang(["empty"], () => '<?xml version="1.0" encoding="UTF-8"?>\n'),
  toml: EMPTY,
  dockerfile: lang(["node", "empty"], (template) =>
    template === "node"
      ? [
          "FROM node:20-alpine",
          "WORKDIR /app",
          "COPY package*.json ./",
          "RUN npm ci",
          "COPY . .",
          'CMD ["node", "index.js"]',
          "",
        ].join("\n")
      : ""
  ),
  other: EMPTY,
};

// Produces deterministic boilerplate from a file's family + chosen template. No
// Claude — pure, synchronous scaffolding.
export class Scaffolder {
  readonly extensionFamily: Readonly<Record<string, string>> = EXTENSION_FAMILY;

  get familyTemplates(): Readonly<Record<string, readonly string[]>> {
    const result: Record<string, readonly string[]> = {};
    for (const [family, provider] of Object.entries(REGISTRY)) {
      result[family] = provider.templates;
    }
    return result;
  }

  fileFamily(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower === "dockerfile" || lower.startsWith("dockerfile.") || lower.endsWith(".dockerfile")) {
      return "dockerfile";
    }
    return EXTENSION_FAMILY[path.extname(lower)] ?? "other";
  }

  generate(request: ScaffoldRequest): string {
    const family = this.fileFamily(request.fileName);
    const provider = REGISTRY[family] ?? EMPTY;
    const context: ScaffoldContext = {
      typeName: (request.typeName || baseName(request.fileName)).trim(),
      namespace: namespaceForDir(request.dir),
      goPackage: goPackageForDir(request.dir),
      absoluteDir: request.absoluteDir,
      fileName: request.fileName,
    };
    return provider.generate(request.template, context);
  }
}
