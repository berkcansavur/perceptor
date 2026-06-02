import { describe, expect, it } from "vitest";
import { QueryAnalyzer } from "../src/core/QueryAnalyzer";
import type { QueryRiskKind } from "../src/service/types";

const analyzer = new QueryAnalyzer();

// loopDepth is supplied by the ComplexityAnalyzer in production; here we pass it explicitly
// so the N+1 rule (DB call inside a loop) is exercised deterministically.
function kinds(code: string, file: string, loopDepth = 0): QueryRiskKind[] {
  return analyzer
    .analyze(code, file, loopDepth)
    .findings.map((finding) => finding.kind)
    .sort();
}

describe("QueryAnalyzer — raw SQL anti-patterns (language-agnostic, from string literals)", () => {
  it("flags SELECT *", () => {
    const code = `const q = "SELECT * FROM users WHERE id = 1";`;
    expect(kinds(code, "repo.ts")).toContain("selectStar");
  });

  it("flags a SELECT with no WHERE/LIMIT as a full scan", () => {
    const code = `const q = "SELECT id, name FROM users";`;
    expect(kinds(code, "repo.ts")).toContain("noWhere");
  });

  it("does not flag COUNT(*) FROM as a full-scan smell", () => {
    const code = `const q = "SELECT COUNT(*) FROM users";`;
    expect(kinds(code, "repo.ts")).not.toContain("noWhere");
  });

  it("flags UPDATE/DELETE without WHERE as high severity", () => {
    const code = `const q = "DELETE FROM sessions";`;
    const report = analyzer.analyze(code, "repo.ts", 0);
    expect(report.findings.map((f) => f.kind)).toContain("writeNoWhere");
    expect(report.risk).toBe("high");
  });

  it("flags a leading-wildcard LIKE", () => {
    const code = "const q = `SELECT id FROM users WHERE name LIKE '%smith'`;";
    expect(kinds(code, "repo.ts")).toContain("leadingWildcard");
  });

  it("flags three or more JOINs", () => {
    const code = `const q = "SELECT * FROM a JOIN b ON 1 JOIN c ON 2 JOIN d ON 3 WHERE a.x = 1";`;
    expect(kinds(code, "repo.ts")).toContain("manyJoins");
  });

  it("ignores ordinary prose that merely contains SQL-ish words", () => {
    const code = `const msg = "Please select an item from the list, where applicable";`;
    expect(kinds(code, "repo.ts")).toEqual([]);
  });
});

describe("QueryAnalyzer — N+1 (ORM call inside a loop), per language", () => {
  it("flags a TypeORM call inside a loop", () => {
    const code = `async load(ids) {\n  for (const id of ids) {\n    const u = await this.repo.findOne({ where: { id } });\n  }\n}`;
    expect(kinds(code, "svc.ts", 1)).toContain("nPlusOne");
  });

  it("flags a JPA repository call inside a loop", () => {
    const code = `void load(ids) {\n  for (Long id : ids) {\n    User u = userRepository.findById(id);\n  }\n}`;
    expect(kinds(code, "Svc.java", 1)).toContain("nPlusOne");
  });

  it("flags an EF Core async materialiser inside a loop", () => {
    const code = `async Load(ids) {\n  foreach (var id in ids) {\n    var u = await db.Users.Where(x => x.Id == id).FirstOrDefaultAsync();\n  }\n}`;
    expect(kinds(code, "Svc.cs", 1)).toContain("nPlusOne");
  });

  it("does NOT flag a DB call when there is no loop", () => {
    const code = `async one(id) {\n  return this.repo.findOne({ where: { id } });\n}`;
    expect(kinds(code, "svc.ts", 0)).not.toContain("nPlusOne");
  });

  it("does NOT mistake Array.find inside a loop for a DB query", () => {
    const code = `pick(rows, ids) {\n  for (const id of ids) {\n    const r = rows.find((x) => x.id === id);\n  }\n}`;
    expect(kinds(code, "svc.ts", 1)).toEqual([]);
  });
});

describe("QueryAnalyzer — ORM smells", () => {
  it("flags an unbounded findAll()", () => {
    const code = `all() {\n  return this.repo.findAll();\n}`;
    expect(kinds(code, "svc.ts", 0)).toContain("unboundedFind");
  });

  it("flags 3+ chained eager Includes (EF Core)", () => {
    const code = `Get() {\n  return db.Orders.Include(o => o.Customer).Include(o => o.Lines).Include(o => o.Shipment).ToListAsync();\n}`;
    expect(kinds(code, "Repo.cs", 0)).toContain("eagerInclude");
  });

  it("reports low risk and no findings for a clean, filtered query", () => {
    const code = `one(id) {\n  return this.repo.findOne({ where: { id } });\n}`;
    const report = analyzer.analyze(code, "svc.ts", 0);
    expect(report.findings).toEqual([]);
    expect(report.risk).toBe("low");
  });
});
