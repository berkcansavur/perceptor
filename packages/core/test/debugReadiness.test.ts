import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DebugReadinessAnalyzer } from "../src/core/DebugReadinessAnalyzer";
import { TestDiscovery } from "../src/core/TestDiscovery";
import type { ClassNode } from "../src/core/types";

let root: string;
let analyzer: DebugReadinessAnalyzer;

function write(relPath: string, content: string): void {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
}

function node(methods: string[]): ClassNode {
  return {
    name: "BasketService",
    kind: "class",
    file: "src/modules/basket/BasketService.ts",
    line: 1,
    dependencies: [{ name: "repo", type: "Repo", baseType: null, source: "constructor" }],
    behaviors: methods.map((name) => ({
      name, visibility: "public", isStatic: false, returnType: "Promise<void>", params: [], line: 1, endLine: 2,
    })),
    id: "BasketService",
    language: "typescript",
    dir: "src/modules/basket",
    folder: "basket",
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rv-readiness-"));
  analyzer = new DebugReadinessAnalyzer(new TestDiscovery());
  write("package.json", `{ "devDependencies": { "jest": "^29" } }`);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("DebugReadinessAnalyzer.analyze — per-method, multi-file", () => {
  it("is untested when no test file exists", () => {
    expect(analyzer.analyze(node(["createBasket"]), root, "createBasket").status).toBe("untested");
  });

  it("is tested when a beside-source test names the method", () => {
    write("src/modules/basket/BasketService.test.ts", `describe("BasketService.removeItem", () => { it("x", () => {}); });`);
    const result = analyzer.analyze(node(["removeItem"]), root, "removeItem");
    expect(result.status).toBe("tested");
  });

  it("finds the covering test in perceptor-tests even when a beside-source test exists for another method", () => {
    write("src/modules/basket/BasketService.test.ts", `describe("BasketService.removeItem", () => { it("x", () => {}); });`);
    write("perceptor-tests/src/modules/basket/BasketService.test.ts", `describe("BasketService.createBasket", () => { it("x", () => {}); });`);

    const result = analyzer.analyze(node(["createBasket"]), root, "createBasket");
    expect(result.status).toBe("tested");
    if (result.status === "tested") {
      expect(result.testFile).toBe(path.join("perceptor-tests", "src/modules/basket/BasketService.test.ts"));
    }
  });

  it("stays untested for a method only mentioned as a mock, not in a title", () => {
    write("src/modules/basket/BasketService.test.ts", `
      describe("BasketService.removeItem", () => {
        it("x", () => { repo.findById.mockResolvedValue(b); });
      });
    `);
    expect(analyzer.analyze(node(["findById"]), root, "findById").status).toBe("untested");
  });
});

describe("DebugReadinessAnalyzer.analyzeClass — union coverage", () => {
  it("aggregates coverage across beside-source and perceptor-tests files", () => {
    write("src/modules/basket/BasketService.test.ts", `describe("BasketService.removeItem", () => { it("x", () => {}); });`);
    write("perceptor-tests/src/modules/basket/BasketService.test.ts", `describe("BasketService.createBasket", () => { it("x", () => {}); });`);

    const report = analyzer.analyzeClass(node(["createBasket", "removeItem", "findById"]), root);
    const byName = Object.fromEntries(report.methods.map((m) => [m.behavior, m.status]));
    expect(byName["removeItem"]).toBe("tested");
    expect(byName["createBasket"]).toBe("tested");
    expect(byName["findById"]).toBe("untested");
    expect(report.debuggablePercent).toBe(67);
  });

  it("marks every method untested when there is no test file", () => {
    const report = analyzer.analyzeClass(node(["createBasket", "removeItem"]), root);
    expect(report.methods.every((m) => m.status === "untested")).toBe(true);
    expect(report.debuggablePercent).toBe(0);
  });
});
