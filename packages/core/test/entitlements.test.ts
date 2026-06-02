import { afterEach, describe, expect, it } from "vitest";
import {
  entitlements,
  setEntitlements,
  unlockedEntitlements,
  type Entitlements,
} from "../src/web/entitlements";

const lockedAll: Entitlements = { has: () => false };

afterEach(() => {
  setEntitlements(unlockedEntitlements);
});

describe("entitlements seam", () => {
  it("unlocks every feature by default (Faz 0)", () => {
    expect(entitlements().has("runFlow")).toBe(true);
  });

  it("hides a gated feature once a locked instance is active", () => {
    setEntitlements(lockedAll);
    expect(entitlements().has("runFlow")).toBe(false);
  });

  it("swaps back to unlocked with a single setEntitlements call", () => {
    setEntitlements(lockedAll);
    setEntitlements(unlockedEntitlements);
    expect(entitlements().has("runFlow")).toBe(true);
  });
});
