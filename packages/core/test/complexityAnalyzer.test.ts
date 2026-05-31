import { describe, expect, it } from "vitest";
import { ComplexityAnalyzer } from "../src/core/ComplexityAnalyzer";

const analyzer = new ComplexityAnalyzer();

function analyze(code: string, name = "") {
  return analyzer.analyze(code, name);
}

describe("ComplexityAnalyzer — loop nesting & Big-O", () => {
  it("reports O(1) for a body with no loops", () => {
    const report = analyze(`greet(name) {\n  return "hi " + name;\n}`);
    expect(report.loopDepth).toBe(0);
    expect(report.bigO).toBe("O(1)");
    expect(report.scale).toEqual([]);
  });

  it("reports O(n) for a single loop", () => {
    const report = analyze(`sum(items) {\n  let total = 0;\n  for (let i = 0; i < items.length; i++) {\n    total += items[i];\n  }\n  return total;\n}`);
    expect(report.loopDepth).toBe(1);
    expect(report.bigO).toBe("O(n)");
    expect(report.scale).toEqual([
      { nExponent: 3, opsExponent: 3 },
      { nExponent: 6, opsExponent: 6 },
    ]);
  });

  it("reports O(n^2) for nested loops with exact op projection", () => {
    const report = analyze(`pairs(n) {\n  for (let i = 0; i < n; i++) {\n    for (let j = 0; j < n; j++) {\n      doThing(i, j);\n    }\n  }\n}`);
    expect(report.loopDepth).toBe(2);
    expect(report.bigO).toBe("O(n^2)");
    expect(report.scale).toEqual([
      { nExponent: 3, opsExponent: 6 },
      { nExponent: 6, opsExponent: 12 },
    ]);
  });

  it("counts an iteration callback nested in a loop as depth 2", () => {
    const report = analyze(`run(groups) {\n  for (const group of groups) {\n    group.items.forEach((item) => handle(item));\n  }\n}`);
    expect(report.loopDepth).toBe(2);
    expect(report.bigO).toBe("O(n^2)");
  });

  it("treats chained iterators as one level, nested iterators as two", () => {
    expect(analyze(`t(items) {\n  return items.map((x) => x + 1).filter((x) => x > 0);\n}`).loopDepth).toBe(1);
    expect(analyze(`m(rows) {\n  return rows.map((row) => row.map((cell) => cell * 2));\n}`).loopDepth).toBe(2);
  });

  it("does not let for(;;) header semicolons break loop detection", () => {
    const report = analyze(`f(n) {\n  for (let i = 0; i < n; i++) {\n    use(i);\n  }\n}`);
    expect(report.loopDepth).toBe(1);
  });
});

describe("ComplexityAnalyzer — cyclomatic complexity (exact)", () => {
  it("counts branches, boolean operators, ternaries and iterators", () => {
    const report = analyze(`process(items) {\n  if (a && b) return;\n  return items.map((x) => (x > 0 ? 1 : 0));\n}`);
    // base 1 + if 1 + && 1 + ternary 1 + .map 1
    expect(report.cyclomatic).toBe(5);
  });

  it("ignores ?. optional chaining, ?? nullish and ?: optional params", () => {
    const report = analyze(`f(name?, obj) {\n  return obj?.value ?? name;\n}`);
    expect(report.cyclomatic).toBe(1);
  });

  it("does not count a method named like a keyword (obj.for())", () => {
    const report = analyze(`weird(obj) {\n  return obj.for(1);\n}`);
    expect(report.cyclomatic).toBe(1);
    expect(report.loopDepth).toBe(0);
  });
});

describe("ComplexityAnalyzer — strings, comments, recursion", () => {
  it("ignores loops/keywords inside strings and comments", () => {
    const report = analyze(`noisy() {\n  const s = "for (x of y) {";\n  // while (true) {}\n  return s.length;\n}`);
    expect(report.loopDepth).toBe(0);
    expect(report.cyclomatic).toBe(1);
  });

  it("flags self-recursion and refuses to guess its Big-O", () => {
    const report = analyze(`factorial(n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}`, "factorial");
    expect(report.recursive).toBe(true);
    expect(report.bigO).toBe("O(?)");
    expect(report.scale).toEqual([]);
  });

  it("does not flag recursion when the name only appears once (its declaration)", () => {
    const report = analyze(`build(n) {\n  return n + 1;\n}`, "build");
    expect(report.recursive).toBe(false);
    expect(report.bigO).toBe("O(1)");
  });
});
