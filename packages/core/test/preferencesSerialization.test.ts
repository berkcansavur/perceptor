import { describe, expect, it } from "vitest";
import {
  buildPreferences,
  frameworkForLanguage,
  joinList,
  splitList,
  toPreferredLanguage,
  type RawPreferenceInputs,
} from "../src/web/forms/preferencesSerialization";

const RAW: RawPreferenceInputs = {
  primaryLanguage: "java",
  preferredFramework: "Spring Boot",
  classCase: "PascalCase",
  methodCase: "camelCase",
  variableCase: "camelCase",
  constantCase: "UPPER_SNAKE_CASE",
  fileNaming: "PascalCase for classes",
  booleanPrefixes: "is, has, can",
  testPattern: "should_{expected}_when_{condition}",
  allowAbbreviations: false,
  dependencyInjection: "constructor",
  layering: "controller, service, repository, model",
  packaging: "feature",
  patterns: "Strategy, Repository",
  errorHandling: "throw-domain-exception",
  maxTimeComplexity: "O(n)",
  maxMethodLines: "30",
  forbidNPlusOneQueries: true,
  requireImpactAnalysis: true,
  forbidCodeDuplication: true,
  enforceSingleResponsibility: true,
  commentsPolicy: "minimal-why-only",
};

describe("preferencesSerialization", () => {
  it("splits and trims a comma list, dropping blanks", () => {
    expect(splitList("is,  has , ,can")).toEqual(["is", "has", "can"]);
  });

  it("joins a list back with comma-space", () => {
    expect(joinList(["controller", "service"])).toBe("controller, service");
  });

  it("coerces an unknown language to the typescript fallback", () => {
    expect(toPreferredLanguage("rust")).toBe("typescript");
    expect(toPreferredLanguage("java")).toBe("java");
  });

  it("builds typed preferences from raw form inputs", () => {
    const preferences = buildPreferences(RAW);
    expect(preferences.primaryLanguage).toBe("java");
    expect(preferences.naming.booleanPrefixes).toEqual(["is", "has", "can"]);
    expect(preferences.architecture.layering).toEqual([
      "controller",
      "service",
      "repository",
      "model",
    ]);
    expect(preferences.qualityGates.maxMethodLines).toBe(30);
  });

  it("keeps a framework that belongs to the primary language", () => {
    const preferences = buildPreferences({ ...RAW, primaryLanguage: "java", preferredFramework: "Spring Boot" });
    expect(preferences.preferredFramework).toBe("Spring Boot");
  });

  it("clears a framework that doesn't belong to the primary language", () => {
    const preferences = buildPreferences({ ...RAW, primaryLanguage: "csharp", preferredFramework: "Spring Boot" });
    expect(preferences.preferredFramework).toBe("");
  });

  it("frameworkForLanguage validates membership", () => {
    expect(frameworkForLanguage("NestJS", "typescript")).toBe("NestJS");
    expect(frameworkForLanguage("NestJS", "java")).toBe("");
    expect(frameworkForLanguage("", "typescript")).toBe("");
  });

  it("falls back to 30 when max method lines is not a positive integer", () => {
    expect(buildPreferences({ ...RAW, maxMethodLines: "abc" }).qualityGates.maxMethodLines).toBe(30);
    expect(buildPreferences({ ...RAW, maxMethodLines: "0" }).qualityGates.maxMethodLines).toBe(30);
  });
});
