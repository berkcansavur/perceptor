import { describe, expect, it } from "vitest";
import { FlowAnalyzer } from "../src/core/FlowAnalyzer";
import { flowAdapterForFile } from "../src/core/flow/FlowLanguageAdapter";
import type {
  FlowBranchStep,
  FlowCallStep,
  FlowInputStep,
  FlowReturnStep,
  FlowStep,
  FlowThrowStep,
} from "../src/service/types";

const analyzer = new FlowAnalyzer();

// The storyboard is a tree (branches nest steps), so tests that care about "every call" walk
// it depth-first rather than only the top-level array.
function collectCalls(steps: FlowStep[]): FlowCallStep[] {
  return steps.flatMap((step) =>
    step.kind === "call"
      ? [step]
      : step.kind === "branch"
        ? [...collectCalls(step.whenTrue), ...collectCalls(step.whenFalse)]
        : []
  );
}

describe("FlowAnalyzer — static run-flow storyboard", () => {
  it("builds input → call → return for a thin delegator", () => {
    const code = `async pickup(dto: PickupDto): Promise<Trip> {\n  const trip = await this.driverPickupService.pickup(dto);\n  return trip;\n}`;
    const { steps } = analyzer.analyze(code, "pickup");

    const input = steps[0] as FlowInputStep;
    expect(input.kind).toBe("input");
    expect(input.params).toEqual(["dto"]);

    const call = steps[1] as FlowCallStep;
    expect(call.kind).toBe("call");
    expect(call.receiver).toBe("this.driverPickupService");
    expect(call.callee).toBe("pickup");
    expect(call.args).toEqual(["dto"]);
    expect(call.awaited).toBe(true);
    expect(call.assignsTo).toBe("trip");

    const ret = steps[2] as FlowReturnStep;
    expect(ret.kind).toBe("return");
    expect(ret.expression).toBe("trip");
  });

  it("captures multiple ordered calls and the variables they fill", () => {
    const code = `createBooking(dto) {\n  const fare = this.fareService.quote(dto.from, dto.to);\n  const booking = this.repo.save(dto, fare);\n  return booking;\n}`;
    const calls = analyzer.analyze(code, "createBooking").steps.filter((s): s is FlowCallStep => s.kind === "call");
    expect(calls.map((c) => c.callee)).toEqual(["quote", "save"]);
    expect(calls[0]?.receiver).toBe("this.fareService");
    expect(calls[0]?.args).toEqual(["dto.from", "dto.to"]);
    expect(calls[0]?.assignsTo).toBe("fare");
    expect(calls[1]?.assignsTo).toBe("booking");
  });

  it("marks a bare free-function call (no receiver) and a discarded result", () => {
    const code = `run(x) {\n  validate(x);\n  return x;\n}`;
    const call = analyzer.analyze(code, "run").steps.find((s): s is FlowCallStep => s.kind === "call");
    expect(call?.receiver).toBeNull();
    expect(call?.callee).toBe("validate");
    expect(call?.assignsTo).toBeNull();
    expect(call?.awaited).toBe(false);
  });

  it("does not mistake control keywords (if/for) for calls", () => {
    const code = `pick(items) {\n  for (const item of items) {\n    if (item.ok) {\n      this.sink.push(item);\n    }\n  }\n}`;
    const calls = collectCalls(analyzer.analyze(code, "pick").steps);
    expect(calls.map((c) => c.callee)).toEqual(["push"]);
  });

  it("nests an if/else into a branch with each arm's steps", () => {
    const code = `route(req) {\n  if (req.isRestricted) {\n    this.audit.log(req);\n    return this.restricted.resolve(req);\n  } else {\n    return this.open.resolve(req);\n  }\n}`;
    const branch = analyzer.analyze(code, "route").steps.find((s): s is FlowBranchStep => s.kind === "branch");
    expect(branch?.condition).toBe("req.isRestricted");
    // The bare call is its own step; the call inside the return shows in the return text.
    expect(collectCalls(branch?.whenTrue ?? []).map((c) => c.callee)).toEqual(["log"]);
    const trueReturn = branch?.whenTrue.find((s): s is FlowReturnStep => s.kind === "return");
    expect(trueReturn?.expression).toBe("this.restricted.resolve(req)");
    const falseReturn = branch?.whenFalse.find((s): s is FlowReturnStep => s.kind === "return");
    expect(falseReturn?.expression).toBe("this.open.resolve(req)");
  });

  it("captures a guard throw inside a branch", () => {
    const code = `notify() {\n  const url = this.config.get('TEAMS_URL');\n  if (!url) {\n    throw new BusinessException(ErrorCodes.UNAVAILABLE_ROUTE);\n  }\n  return this.http.post(url);\n}`;
    const { steps } = analyzer.analyze(code, "notify");
    const branch = steps.find((s): s is FlowBranchStep => s.kind === "branch");
    expect(branch?.condition).toBe("!url");
    const thrown = branch?.whenTrue.find((s): s is FlowThrowStep => s.kind === "throw");
    expect(thrown?.kind).toBe("throw");
    expect(thrown?.expression).toBe("new BusinessException(ErrorCodes.UNAVAILABLE_ROUTE)");
    // The guard's exception is a throw step, NOT a spurious "calls BusinessException(...)".
    // `post` lives in the trailing return expression, not as a separate call step.
    expect(collectCalls(steps).map((c) => c.callee)).toEqual(["get"]);
  });

  it("chains else-if into nested branches", () => {
    const code = `tier(n) {\n  if (n > 100) {\n    return this.gold.apply(n);\n  } else if (n > 10) {\n    return this.silver.apply(n);\n  } else {\n    return this.bronze.apply(n);\n  }\n}`;
    const branch = analyzer.analyze(code, "tier").steps.find((s): s is FlowBranchStep => s.kind === "branch");
    expect(branch?.condition).toBe("n > 100");
    const goldReturn = branch?.whenTrue.find((s): s is FlowReturnStep => s.kind === "return");
    expect(goldReturn?.expression).toBe("this.gold.apply(n)");
    const nested = branch?.whenFalse.find((s): s is FlowBranchStep => s.kind === "branch");
    expect(nested?.condition).toBe("n > 10");
    const silverReturn = nested?.whenTrue.find((s): s is FlowReturnStep => s.kind === "return");
    expect(silverReturn?.expression).toBe("this.silver.apply(n)");
    const bronzeReturn = nested?.whenFalse.find((s): s is FlowReturnStep => s.kind === "return");
    expect(bronzeReturn?.expression).toBe("this.bronze.apply(n)");
  });

  it("returns no steps for a trivial method with no calls and no return value", () => {
    const code = `noop() {\n  let x = 1;\n}`;
    expect(analyzer.analyze(code, "noop").steps).toEqual([]);
  });

  it("ignores call-like text inside strings and comments", () => {
    const code = `greet(name) {\n  // never call ignored(name)\n  const msg = "hello(" + name;\n  return msg;\n}`;
    const calls = analyzer.analyze(code, "greet").steps.filter((s): s is FlowCallStep => s.kind === "call");
    expect(calls).toEqual([]);
  });

  it("expands a destructured parameter into its binding names, dropping the type", () => {
    const code = `createBooking({ requestDto, directionPoints, stops = [], isRestricted }: { requestDto: Pick<Dto, 'a' | 'b'>; isRestricted: boolean; }): Promise<Result> {\n  return this.repo.save(requestDto);\n}`;
    const input = analyzer.analyze(code, "createBooking").steps.find((s): s is FlowInputStep => s.kind === "input");
    expect(input?.params).toEqual(["requestDto", "directionPoints", "stops", "isRestricted"]);
  });

  it("finds the body past an object-literal return type (Promise<{...}>)", () => {
    // Regression: the body brace must be the one whose match is the method's final `}`, not
    // the `{` inside the `Promise<{...}>` return-type annotation — otherwise the scan starts
    // inside the type, finds no statements, and the whole run-flow storyboard goes empty.
    const code = `async createBooking(dto: Dto): Promise<{ booking: Booking; route: RouteDto }> {\n  const booking = await this.repo.save(dto);\n  return { booking, route: booking.route };\n}`;
    const { steps } = analyzer.analyze(code, "createBooking");
    const calls = collectCalls(steps);
    expect(calls.map((c) => c.callee)).toEqual(["save"]);
    expect(calls[0]?.assignsTo).toBe("booking");
    expect(steps.some((s) => s.kind === "return")).toBe(true);
  });

  it("shows the complete behaviour (does not truncate at a small cap)", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `  this.svc.step${i}();`).join("\n");
    const code = `many() {\n${lines}\n}`;
    const calls = analyzer.analyze(code, "many").steps.filter((s) => s.kind === "call");
    expect(calls).toHaveLength(20);
  });
});

describe("FlowAnalyzer — Go adapter", () => {
  const go = flowAdapterForFile("svc.go");

  it("parses a paren-less Go `if`, `:=` capture and panic-as-call", () => {
    const code = [
      "func (s *Svc) Charge(stops []Stop) (int, error) {",
      "  fee := s.toll.Compute(stops)",
      "  if fee > 100 {",
      "    s.audit.Warn(fee)",
      "    panic(\"too high\")",
      "  }",
      "  return fee, nil",
      "}",
    ].join("\n");
    const { steps } = analyzer.analyze(code, "Charge", go);

    const compute = steps.find((s): s is FlowCallStep => s.kind === "call");
    expect(compute?.callee).toBe("Compute");
    expect(compute?.assignsTo).toBe("fee");

    const branch = steps.find((s): s is FlowBranchStep => s.kind === "branch");
    expect(branch?.condition).toBe("fee > 100");
    // `panic(...)` is a normal call step (Go has no `throw`); `Warn` shows too.
    expect(collectCalls(branch?.whenTrue ?? []).map((c) => c.callee)).toEqual(["Warn", "panic"]);
    // No `throw` step is ever produced for Go.
    expect(collectCalls(steps).every((c) => c.kind === "call")).toBe(true);
    expect(steps.some((s) => s.kind === "throw")).toBe(false);

    const ret = steps.find((s): s is FlowReturnStep => s.kind === "return");
    expect(ret?.expression).toBe("fee, nil");
  });

  it("falls back to the C-like adapter for non-Go files", () => {
    expect(flowAdapterForFile("svc.ts").id).toBe("c-like");
    expect(flowAdapterForFile(undefined).id).toBe("c-like");
    expect(flowAdapterForFile("svc.go").id).toBe("go");
  });
});
