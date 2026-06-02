import { describe, expect, it } from "vitest";
import { ERROR_CODES, type ErrorCodeName } from "../src/service/api/ErrorCode";
import { I18N } from "../src/web/i18n";
import { errorMessage } from "../src/web/errors";

const codeNames = Object.keys(ERROR_CODES) as ErrorCodeName[];

describe("error localisation parity", () => {
  it("has an err.<CODE> message for every ErrorCode in both locales", () => {
    for (const name of codeNames) {
      const key = `err.${name}`;
      expect(I18N.en[key], `missing EN ${key}`).toBeTypeOf("string");
      expect(I18N.tr[key], `missing TR ${key}`).toBeTypeOf("string");
    }
  });

  it("has the generic fallback in both locales", () => {
    expect(I18N.en["err.generic"]).toBeTypeOf("string");
    expect(I18N.tr["err.generic"]).toBeTypeOf("string");
  });
});

describe("errorMessage mapper", () => {
  it("maps a coded API error to its localised message", () => {
    for (const name of codeNames) {
      expect(errorMessage({ code: name })).toBe(I18N.en[`err.${name}`]);
    }
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(errorMessage({ code: "NOPE_NOT_A_CODE" })).toBe(I18N.en["err.generic"]);
  });

  it("falls back to the generic message for a plain Error (no code)", () => {
    expect(errorMessage(new Error("raw host detail"))).toBe(I18N.en["err.generic"]);
  });

  it("never leaks the raw thrown message", () => {
    expect(errorMessage(new Error("ENOENT: no such file"))).not.toContain("ENOENT");
    expect(errorMessage("some string throw")).toBe(I18N.en["err.generic"]);
  });
});
