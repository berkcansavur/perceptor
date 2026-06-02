import { describe, expect, it } from "vitest";
import { flowOutline } from "../src/web/complexity/flowOutline";
import type { FlowReport } from "../src/service/types";

describe("flowOutline — compact narration skeleton", () => {
  it("returns empty for a flow with no steps", () => {
    expect(flowOutline({ steps: [] })).toBe("");
  });

  it("renders inputs, calls, captured results and await", () => {
    const flow: FlowReport = {
      steps: [
        { kind: "input", params: ["req", "stops"] },
        {
          kind: "call",
          receiver: "this.config",
          callee: "get",
          args: ["'TEAMS_URL'"],
          awaited: false,
          assignsTo: "url",
        },
        { kind: "call", receiver: "this.audit", callee: "log", args: ["req"], awaited: true, assignsTo: null },
      ],
    };
    expect(flowOutline(flow)).toBe(
      ["input: req, stops", "call this.config.get('TEAMS_URL') -> url", "await this.audit.log(req)"].join("\n")
    );
  });

  it("nests branch arms under if/else with indentation", () => {
    const flow: FlowReport = {
      steps: [
        {
          kind: "branch",
          condition: "req.isRestricted",
          whenTrue: [
            {
              kind: "branch",
              condition: "stops.length > 2",
              whenTrue: [
                { kind: "call", receiver: "this.toll", callee: "charge", args: ["stops"], awaited: true, assignsTo: "fee" },
              ],
              whenFalse: [
                { kind: "call", receiver: "this.toll", callee: "skip", args: [], awaited: false, assignsTo: null },
              ],
            },
            { kind: "return", expression: "this.restricted.resolve(req, url)" },
          ],
          whenFalse: [{ kind: "return", expression: "result" }],
        },
      ],
    };
    expect(flowOutline(flow)).toBe(
      [
        "if req.isRestricted:",
        "  if stops.length > 2:",
        "    await this.toll.charge(stops) -> fee",
        "  else:",
        "    call this.toll.skip()",
        "  return this.restricted.resolve(req, url)",
        "else:",
        "  return result",
      ].join("\n")
    );
  });

  it("renders a guard throw and omits an absent else", () => {
    const flow: FlowReport = {
      steps: [
        {
          kind: "branch",
          condition: "!url",
          whenTrue: [{ kind: "throw", expression: "new BusinessException(ErrorCodes.UNAVAILABLE_ROUTE)" }],
          whenFalse: [],
        },
      ],
    };
    expect(flowOutline(flow)).toBe(
      ["if !url:", "  throw new BusinessException(ErrorCodes.UNAVAILABLE_ROUTE)"].join("\n")
    );
  });

  it("labels an empty-param input", () => {
    expect(flowOutline({ steps: [{ kind: "input", params: [] }] })).toBe("input: (none)");
  });
});
