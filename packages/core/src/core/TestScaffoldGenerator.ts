import * as path from "path";
import type { Behavior, Parameter, Dependency } from "./types";
import type { TestFramework } from "./TestDiscovery";

type TestScaffoldConfig = {
  readonly className: string;
  readonly file: string;
  readonly behaviors: readonly Behavior[];
  readonly constructorDeps: readonly Dependency[];
  readonly framework: TestFramework;
  readonly methodFilter: readonly string[];
};

export class TestScaffoldGenerator {
  generate(config: TestScaffoldConfig): string {
    const framework = config.framework;
    if (framework === "vitest") return this.vitestScaffold(config);
    if (framework === "jest") return this.jestScaffold(config);
    return this.jestScaffold(config);
  }

  private vitestScaffold(config: TestScaffoldConfig): string {
    const lines: string[] = [];
    const importPath = this.buildImportPath(config.file);
    const methods = this.filterMethods(config.behaviors, config.methodFilter);

    lines.push(`import { describe, it, expect, vi, beforeEach } from "vitest";`);
    lines.push(`import { ${config.className} } from "${importPath}";`);
    lines.push("");

    this.appendDescribeBlock(lines, config, methods);
    return lines.join("\n") + "\n";
  }

  private jestScaffold(config: TestScaffoldConfig): string {
    const lines: string[] = [];
    const importPath = this.buildImportPath(config.file);
    const methods = this.filterMethods(config.behaviors, config.methodFilter);

    lines.push(`import { ${config.className} } from "${importPath}";`);
    lines.push("");

    this.appendDescribeBlock(lines, config, methods);
    return lines.join("\n") + "\n";
  }

  private appendDescribeBlock(
    lines: string[],
    config: TestScaffoldConfig,
    methods: readonly Behavior[]
  ): void {
    const deps = config.constructorDeps;
    const hasDeps = deps.length > 0;

    lines.push(`describe("${config.className}", () => {`);

    if (hasDeps) {
      for (const dep of deps) {
        const mockName = `mock${dep.name.charAt(0).toUpperCase()}${dep.name.slice(1)}`;
        lines.push(`  const ${mockName} = {`);
        lines.push(`    // TODO: add mocked methods for ${dep.type}`);
        lines.push(`  } as unknown as ${dep.type};`);
      }
      lines.push("");
    }

    lines.push(`  let sut: ${config.className};`);
    lines.push("");
    lines.push(`  beforeEach(() => {`);

    if (hasDeps) {
      const constructorArgs = deps.map((dep) => {
        return `mock${dep.name.charAt(0).toUpperCase()}${dep.name.slice(1)}`;
      }).join(", ");
      lines.push(`    sut = new ${config.className}(${constructorArgs});`);
    } else {
      lines.push(`    sut = new ${config.className}();`);
    }

    lines.push(`  });`);
    lines.push("");

    for (const method of methods) {
      this.appendMethodTests(lines, method);
    }

    lines.push(`});`);
  }

  private appendMethodTests(lines: string[], method: Behavior): void {
    const isAsync = method.returnType.includes("Promise");

    lines.push(`  describe("${method.name}", () => {`);
    lines.push(`    it("should execute ${method.name} successfully", ${isAsync ? "async " : ""}() => {`);

    if (method.params.length > 0) {
      for (const param of method.params) {
        lines.push(`      const ${param.name} = ${this.defaultLiteral(param)};`);
      }
      lines.push("");
    }

    const paramArgs = method.params.map((p) => p.name).join(", ");
    const call = `sut.${method.name}(${paramArgs})`;

    if (isAsync) {
      lines.push(`      const result = await ${call};`);
    } else {
      lines.push(`      const result = ${call};`);
    }

    lines.push("");
    lines.push(`      expect(result).toBeDefined();`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push("");
  }

  private filterMethods(behaviors: readonly Behavior[], filter: readonly string[]): readonly Behavior[] {
    if (filter.length === 0) return behaviors;
    return behaviors.filter((b) => filter.includes(b.name));
  }

  private buildImportPath(sourceFile: string): string {
    const baseName = path.basename(sourceFile).replace(/\.[cm]?tsx?$/, "");
    return "./" + baseName;
  }

  private defaultLiteral(param: Parameter): string {
    const lower = param.type.toLowerCase().replace(/\s/g, "");
    if (lower === "string") return `"test-${param.name}"`;
    if (["number", "int", "float", "double", "decimal", "long"].includes(lower)) return "1";
    if (lower === "boolean" || lower === "bool") return "true";
    if (lower.endsWith("[]") || lower.startsWith("array") || lower.startsWith("list")) return "[]";
    if (["record", "map", "object", "dictionary"].some((k) => lower.includes(k))) return "{}";
    return `{} as ${param.type}`;
  }
}
