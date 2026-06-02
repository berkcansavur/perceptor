import { describe, expect, it } from "vitest";
import { ComplexityAnalyzer } from "../src/core/ComplexityAnalyzer";

const analyzer = new ComplexityAnalyzer();

function analyze(code: string, name = "") {
  return analyzer.analyze(code, name);
}

function analyzeFile(code: string, file: string, name = "") {
  return analyzer.analyze(code, name, file);
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

  it("counts a brace-less single-statement loop as O(n)", () => {
    const report = analyze(`f(n) {\n  for (let i = 0; i < n; i++) acc(i);\n  return acc;\n}`);
    expect(report.loopDepth).toBe(1);
    expect(report.bigO).toBe("O(n)");
  });

  it("counts a brace-less while loop as O(n)", () => {
    const report = analyze(`h(n) {\n  while (n--) tick();\n  return 0;\n}`);
    expect(report.loopDepth).toBe(1);
  });

  it("counts nested brace-less loops as O(n^2)", () => {
    const report = analyze(`f(n) {\n  for (let i = 0; i < n; i++)\n    for (let j = 0; j < n; j++) sum += grid[i][j];\n}`);
    expect(report.loopDepth).toBe(2);
    expect(report.bigO).toBe("O(n^2)");
  });

  it("counts a brace-less outer loop over a braced inner loop as O(n^2)", () => {
    const report = analyze(`f(n) {\n  for (let i = 0; i < n; i++)\n    for (let j = 0; j < n; j++) { hit(i, j); }\n}`);
    expect(report.loopDepth).toBe(2);
  });

  it("does not leak a brace-less loop onto a following sibling block", () => {
    const report = analyze(`f(n) {\n  for (let i = 0; i < n; i++) acc(i);\n  if (c) { return 1; }\n}`);
    expect(report.loopDepth).toBe(1);
  });

  it("ends a brace-less loop body at a braced sub-statement", () => {
    const report = analyze(`f(xs) {\n  for (const x of xs) if (ok(x)) { use(x); }\n  cleanup();\n}`);
    expect(report.loopDepth).toBe(1);
  });

  it("does not treat a do-while condition as a loop that leaks onto the next block", () => {
    const report = analyze(`g(n) {\n  do { step(); } while (n--);\n  if (x) { cleanup(); }\n}`);
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

  it("does NOT flag a thin delegator that calls a same-named method on another object", () => {
    const report = analyze(`async pickup() {\n  return this.driverPickupService.pickup();\n}`, "pickup");
    expect(report.recursive).toBe(false);
    expect(report.bigO).toBe("O(1)");
    expect(report.scale).toEqual([]);
  });

  it("flags self-recursion through `this.` (method calling itself on the same object)", () => {
    const report = analyze(`walk(node) {\n  if (!node) return;\n  this.walk(node.next);\n}`, "walk");
    expect(report.recursive).toBe(true);
    expect(report.bigO).toBe("O(?)");
  });

  it("does NOT flag a member call on another receiver even without `this`", () => {
    const report = analyze(`load(id) {\n  return repo.load(id);\n}`, "load");
    expect(report.recursive).toBe(false);
    expect(report.bigO).toBe("O(1)");
  });
});

// The structural walk is shared, but loop keywords / iterator method names are resolved
// per language from the file extension. With no path, the analyzer keeps its TS/JS behavior.
describe("ComplexityAnalyzer — language-aware loop & iterator vocabularies", () => {
  it("counts C# foreach as a loop (O(n)) — but only for .cs files", () => {
    const code = `Process(items) {\n  foreach (var x in items) {\n    Use(x);\n  }\n}`;
    expect(analyzeFile(code, "Service.cs").loopDepth).toBe(1);
    expect(analyzeFile(code, "Service.cs").bigO).toBe("O(n)");
    // `foreach` is just an identifier in TS — no loop, proving the vocabulary is language-keyed.
    expect(analyze(code).loopDepth).toBe(0);
  });

  it("counts nested C# foreach as O(n^2)", () => {
    const code = `Pairs(xs, ys) {\n  foreach (var a in xs) {\n    foreach (var b in ys) {\n      Hit(a, b);\n    }\n  }\n}`;
    const report = analyzeFile(code, "Pairs.cs");
    expect(report.loopDepth).toBe(2);
    expect(report.bigO).toBe("O(n^2)");
  });

  it("treats chained C# LINQ as one level and nested LINQ as two", () => {
    const chained = `Run(items) {\n  return items.Where(x => x > 0).Select(x => x * 2);\n}`;
    expect(analyzeFile(chained, "Linq.cs").loopDepth).toBe(1);
    const nested = `Run(xs, ys) {\n  return xs.Select(x => ys.Where(y => y == x));\n}`;
    expect(analyzeFile(nested, "Linq.cs").loopDepth).toBe(2);
  });

  it("counts C# foreach toward cyclomatic complexity", () => {
    const code = `Scan(items) {\n  foreach (var x in items) {\n    if (x > 0) Use(x);\n  }\n}`;
    // base 1 + foreach 1 + if 1
    expect(analyzeFile(code, "Scan.cs").cyclomatic).toBe(3);
  });

  it("counts Java Stream pipeline operations as loops (O(n))", () => {
    const code = `sum(items) {\n  return items.stream().map(x -> x + 1).reduce(0, Integer::sum);\n}`;
    expect(analyzeFile(code, "Sum.java").loopDepth).toBe(1);
    expect(analyzeFile(code, "Sum.java").bigO).toBe("O(n)");
  });
});
