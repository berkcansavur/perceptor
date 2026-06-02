import type {
  FlowBranchStep,
  FlowCallStep,
  FlowReport,
  FlowReturnStep,
  FlowStep,
  FlowThrowStep,
} from "../types";

// Serialise the (already-extracted, deterministic) control-flow tree into a compact, indented
// text outline — the same skeleton the storyboard renders, minus HTML and example values.
//
// This is the *token-optimized narration context*: it's handed to the describe-behavior skill
// so Claude narrates the method branch-by-branch (what each decision means, what runs in each
// case) WITHOUT having to re-derive control flow from raw source. The structure here is
// extracted by the analyzer (no Claude); Claude only adds meaning on top.
//
// Returns "" when there's nothing worth narrating, mirroring `flowStrip`.
export function flowOutline(flow: FlowReport): string {
  if (flow.steps.length === 0) {
    return "";
  }
  return renderSteps(flow.steps, 0).join("\n");
}

function renderSteps(steps: FlowStep[], depth: number): string[] {
  const lines: string[] = [];
  for (const step of steps) {
    if (step.kind === "branch") {
      lines.push(...branchLines(step, depth));
      continue;
    }
    lines.push(indent(depth) + leafLine(step));
  }
  return lines;
}

function branchLines(step: FlowBranchStep, depth: number): string[] {
  const lines: string[] = [`${indent(depth)}if ${step.condition}:`];
  lines.push(...renderSteps(step.whenTrue, depth + 1));
  if (step.whenFalse.length > 0) {
    lines.push(`${indent(depth)}else:`);
    lines.push(...renderSteps(step.whenFalse, depth + 1));
  }
  return lines;
}

function leafLine(step: Exclude<FlowStep, FlowBranchStep>): string {
  switch (step.kind) {
    case "input":
      return step.params.length > 0 ? `input: ${step.params.join(", ")}` : "input: (none)";
    case "call":
      return callLine(step);
    case "return":
      return returnLine(step);
    default:
      return throwLine(step);
  }
}

function callLine(step: FlowCallStep): string {
  const verb = step.awaited ? "await" : "call";
  const target = step.receiver ? `${step.receiver}.${step.callee}` : step.callee;
  const call = `${verb} ${target}(${step.args.join(", ")})`;
  return step.assignsTo ? `${call} -> ${step.assignsTo}` : call;
}

function returnLine(step: FlowReturnStep): string {
  return `return ${step.expression}`;
}

function throwLine(step: FlowThrowStep): string {
  return `throw ${step.expression}`;
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}
