import { describe, expect, it } from "vitest";
import { collectRefs, evalCondition, type Env } from "../src/web/complexity/conditionEval";

describe("conditionEval — safe branch condition evaluator", () => {
  it("evaluates a boolean member reference", () => {
    const env: Env = { "req.isRestricted": { t: "bool", v: true } };
    expect(evalCondition("req.isRestricted", env)).toBe("true");
    expect(evalCondition("!req.isRestricted", env)).toBe("false");
  });

  it("treats a null stub as falsy and a present stub as truthy", () => {
    expect(evalCondition("!url", { url: { t: "null" } })).toBe("true");
    expect(evalCondition("url", { url: { t: "present" } })).toBe("true");
    expect(evalCondition("!url", { url: { t: "present" } })).toBe("false");
  });

  it("compares numbers with relational operators", () => {
    const env: Env = { n: { t: "num", v: 150 } };
    expect(evalCondition("n > 100", env)).toBe("true");
    expect(evalCondition("n > 100 && n < 200", env)).toBe("true");
    expect(evalCondition("n < 10", env)).toBe("false");
  });

  it("handles equality against string and number literals", () => {
    expect(evalCondition("status === 'open'", { status: { t: "str", v: "open" } })).toBe("true");
    expect(evalCondition("status === 'open'", { status: { t: "str", v: "closed" } })).toBe("false");
    expect(evalCondition("count != 0", { count: { t: "num", v: 3 } })).toBe("true");
  });

  it("returns unknown when a referenced value is missing", () => {
    expect(evalCondition("mystery", {})).toBe("unknown");
    expect(evalCondition("a && b", { a: { t: "bool", v: true } })).toBe("unknown");
  });

  it("short-circuits: false && unknown is false, true || unknown is true", () => {
    expect(evalCondition("a && b", { a: { t: "bool", v: false } })).toBe("false");
    expect(evalCondition("a || b", { a: { t: "bool", v: true } })).toBe("true");
  });

  it("equality against a present (exact-unknown) stub is unknown", () => {
    expect(evalCondition("url === 'x'", { url: { t: "present" } })).toBe("unknown");
  });

  it("respects parentheses and precedence", () => {
    const env: Env = { a: { t: "bool", v: true }, b: { t: "bool", v: false }, c: { t: "bool", v: true } };
    expect(evalCondition("a && (b || c)", env)).toBe("true");
    expect(evalCondition("a && b || c", env)).toBe("true");
  });

  it("collects the distinct references a condition uses", () => {
    expect(collectRefs("req.isRestricted && stops.length > 2").sort()).toEqual([
      "req.isRestricted",
      "stops.length",
    ]);
    expect(collectRefs("!url")).toEqual(["url"]);
  });

  it("falls back to unknown (not a throw) on unsupported syntax", () => {
    expect(evalCondition("items[0] > 1", { items: { t: "present" } })).toBe("unknown");
    expect(evalCondition("@@@", {})).toBe("unknown");
  });
});
