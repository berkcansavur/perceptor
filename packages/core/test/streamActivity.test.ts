import { describe, expect, it } from "vitest";
import { activityFromStreamLine, usageFromStreamLine } from "../src/service/processing/streamActivity";

describe("activityFromStreamLine", () => {
  it("returns the assistant's narration text", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Inspecting the repo, planning the hexagonal layout." }] },
    });
    expect(activityFromStreamLine(line)).toBe("Inspecting the repo, planning the hexagonal layout.");
  });

  it("labels a tool use with its target file", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "src/service/OrderService.ts" } }] },
    });
    expect(activityFromStreamLine(line)).toBe("Editing OrderService.ts");
  });

  it("describes a Bash tool by its description", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Bash", input: { description: "Run the type checker" } }] },
    });
    expect(activityFromStreamLine(line)).toBe("Run the type checker");
  });

  it("ignores non-assistant events and malformed lines", () => {
    expect(activityFromStreamLine(JSON.stringify({ type: "result", subtype: "success" }))).toBeNull();
    expect(activityFromStreamLine("not json")).toBeNull();
    expect(activityFromStreamLine("")).toBeNull();
  });

  it("collapses and truncates long narration", () => {
    const long = "a".repeat(200);
    const line = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: long }] } });
    const result = activityFromStreamLine(line) ?? "";
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("usageFromStreamLine", () => {
  it("extracts tokens and cost from the result event", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      total_cost_usd: 0.0123,
      usage: {
        input_tokens: 1200,
        output_tokens: 340,
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 50,
      },
    });
    expect(usageFromStreamLine(line)).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
      cacheReadTokens: 800,
      cacheCreationTokens: 50,
      costUsd: 0.0123,
    });
  });

  it("returns null for assistant events and malformed lines", () => {
    expect(usageFromStreamLine(JSON.stringify({ type: "assistant", message: {} }))).toBeNull();
    expect(usageFromStreamLine(JSON.stringify({ type: "result" }))).toBeNull();
    expect(usageFromStreamLine("not json")).toBeNull();
  });
});
