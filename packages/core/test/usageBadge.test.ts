import { describe, expect, it } from "vitest";
import { usageBadge } from "../src/web/usageBadge";
import type { TaskUsage } from "../src/web/types";

function usage(overrides: Partial<TaskUsage>): TaskUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    runs: 1,
    at: "2026-05-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("usageBadge", () => {
  it("renders nothing when no run has reported usage", () => {
    expect(usageBadge(undefined)).toBe("");
    expect(usageBadge(usage({ runs: 0 }))).toBe("");
  });

  it("compacts thousands and shows direction arrows", () => {
    const html = usageBadge(usage({ inputTokens: 1200, outputTokens: 340 }));
    expect(html).toContain("↑1.2k");
    expect(html).toContain("↓340");
  });

  it("shows a sub-cent cost as <$0.01 and rounds larger costs", () => {
    expect(usageBadge(usage({ costUsd: 0.004 }))).toContain("<$0.01");
    expect(usageBadge(usage({ costUsd: 0.0234 }))).toContain("$0.02");
  });

  it("omits cost when zero", () => {
    expect(usageBadge(usage({ inputTokens: 10, costUsd: 0 }))).not.toContain("$");
  });
});
