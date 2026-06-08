import { evalCondition, collectRefs, type Env, type Val } from "../web/complexity/conditionEval";
import type { FlowReport, FlowStep, SimulatedStep, SimulationMetadata } from "../service/types";

export class SimulationEngine {
  metadata(flow: FlowReport): SimulationMetadata {
    const params = this.inputParams(flow);
    const conditions = this.collectConditions(flow.steps);
    const allRefs = this.distinctRefs(conditions);
    const nested = allRefs.filter((ref) => ref.includes(".") && params.includes(this.rootOf(ref)));
    const nestedRoots = new Set(nested.map((ref) => this.rootOf(ref)));
    const bareParams = params.filter((param) => !nestedRoots.has(param));
    const inputRefs = [...bareParams, ...nested];
    const stubRefs = allRefs.filter((ref) => !params.includes(this.rootOf(ref)));
    const defaultPayload = this.buildDefaultPayload([...inputRefs, ...stubRefs]);
    return { inputRefs, stubRefs, defaultPayload };
  }

  simulate(flow: FlowReport, env: Env): readonly SimulatedStep[] {
    return this.walkSteps(flow.steps, env, 0, true);
  }

  toEnv(raw: Record<string, unknown>): Env {
    const env: Env = {};
    this.flattenToEnv(raw, "", env);
    return env;
  }

  private flattenToEnv(obj: Record<string, unknown>, prefix: string, env: Env): void {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(value)) {
        env[path] = { t: "present" };
        env[`${path}.length`] = { t: "num", v: value.length };
      } else if (typeof value === "object" && value !== null) {
        env[path] = { t: "present" };
        this.flattenToEnv(value as Record<string, unknown>, path, env);
      } else {
        env[path] = this.toVal(value);
      }
    }
  }

  private toVal(value: unknown): Val {
    if (value === null || value === undefined) {
      return { t: "null" };
    }
    if (typeof value === "number") {
      return { t: "num", v: value };
    }
    if (typeof value === "string") {
      return { t: "str", v: value };
    }
    if (typeof value === "boolean") {
      return { t: "bool", v: value };
    }
    return { t: "present" };
  }

  private walkSteps(steps: FlowStep[], env: Env, depth: number, reachable: boolean): SimulatedStep[] {
    const result: SimulatedStep[] = [];
    for (const step of steps) {
      if (step.kind === "input") {
        result.push({ kind: "input", description: `input: ${step.params.join(", ")}`, taken: reachable, depth, verdict: null });
      } else if (step.kind === "call") {
        const receiver = step.receiver ? `${step.receiver}.` : "";
        const assignsTo = step.assignsTo ? `${step.assignsTo} = ` : "";
        const awaited = step.awaited ? "await " : "";
        result.push({
          kind: "call",
          description: `${assignsTo}${awaited}${receiver}${step.callee}(${step.args.join(", ")})`,
          taken: reachable, depth, verdict: null,
        });
      } else if (step.kind === "return") {
        result.push({ kind: "return", description: `return ${step.expression}`, taken: reachable, depth, verdict: null });
      } else if (step.kind === "throw") {
        result.push({ kind: "throw", description: `throw ${step.expression}`, taken: reachable, depth, verdict: null });
      } else if (step.kind === "branch") {
        const verdict = reachable ? evalCondition(step.condition, env) : "unknown";
        result.push({ kind: "branch", description: `if (${step.condition})`, taken: reachable, depth, verdict });
        result.push(...this.walkSteps(step.whenTrue, env, depth + 1, reachable && verdict !== "false"));
        if (step.whenFalse.length > 0) {
          result.push(...this.walkSteps(step.whenFalse, env, depth + 1, reachable && verdict !== "true"));
        }
      }
    }
    return result;
  }

  private inputParams(flow: FlowReport): string[] {
    const input = flow.steps.find((step) => step.kind === "input");
    return input && input.kind === "input" ? [...input.params] : [];
  }

  private collectConditions(steps: FlowStep[]): string[] {
    const out: string[] = [];
    for (const step of steps) {
      if (step.kind === "branch") {
        out.push(step.condition);
        out.push(...this.collectConditions(step.whenTrue));
        out.push(...this.collectConditions(step.whenFalse));
      }
    }
    return out;
  }

  private distinctRefs(conditions: string[]): string[] {
    const seen: string[] = [];
    for (const condition of conditions) {
      for (const ref of collectRefs(condition)) {
        if (!seen.includes(ref)) {
          seen.push(ref);
        }
      }
    }
    return seen;
  }

  private rootOf(ref: string): string {
    return ref.split(".")[0] ?? ref;
  }

  private buildDefaultPayload(refs: string[]): Record<string, unknown> {
    const root: Record<string, unknown> = {};
    for (const ref of refs) {
      const segments = ref.split(".");
      const last = segments[segments.length - 1] ?? ref;
      if ((last === "length" || last === "size") && segments.length > 1) {
        this.assignPath(root, segments.slice(0, -1), [1, 2]);
      } else {
        this.assignPath(root, segments, this.defaultValue(ref));
      }
    }
    return root;
  }

  private assignPath(root: Record<string, unknown>, segments: string[], value: unknown): void {
    let current = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i] ?? "";
      if (typeof current[key] !== "object" || current[key] === null || Array.isArray(current[key])) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    current[segments[segments.length - 1] ?? ""] = value;
  }

  private defaultValue(ref: string): unknown {
    const leaf = (ref.split(".").pop() ?? ref).toLowerCase();
    if (/^(is|has|can|should|are|was|allow)/.test(leaf)) {
      return true;
    }
    if (/(enabled|disabled|restricted|active|valid|visible)$/.test(leaf)) {
      return true;
    }
    if (leaf === "id" || /id$/.test(leaf)) {
      return 42;
    }
    if (/(count|qty|amount|price|total|fare|fee|sum|index|limit|offset|num|number)/.test(leaf)) {
      return 42;
    }
    if (/(status|type|state|kind|mode)/.test(leaf)) {
      return "open";
    }
    return "sample";
  }
}
