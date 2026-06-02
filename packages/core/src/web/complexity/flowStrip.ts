import { t } from "../i18n";
import type {
  FlowBranchStep,
  FlowCallStep,
  FlowInputStep,
  FlowReport,
  FlowReturnStep,
  FlowStep,
  FlowThrowStep,
} from "../types";

// The run-flow storyboard: an ordered, numbered account of what the method does — the inputs
// it receives, the branches it takes (`if <cond>` / `else` with their work nested under them),
// each call it makes (callee, args, captured variable, await), what it throws, and what it
// returns. A FlowPlayer reveals the steps one at a time; a payload simulator can light up only
// the path a given input takes. These are STATIC steps read off the source, NOT a runtime
// trace — the UI labels that. Concrete, editable values live in the payload simulator above.
//
// The tree is flattened into a single ordered list where every row carries its nesting depth
// (`--fx-depth`) and the chain of branch arms it lives under (`data-fx-anc`). A flat list
// keeps the FlowPlayer reveal trivial (document order = play order) and avoids any nested-list
// overlap in the panel, while the depth/ancestor hooks let the simulator dim untaken arms.
//
// Renders nothing when there's no flow worth showing, so a trivial method shows no section.
export function flowStrip(flow: FlowReport): string {
  if (flow.steps.length === 0) {
    return "";
  }
  const rows = renderSteps(flow.steps, 0, [], { branchId: 0 }).join("");
  const note = `<div class="fx-note">${escape(t("fx.note"))}</div>`;
  return `<div class="fx-strip">${head()}<ol class="fx-steps">${rows}</ol>${note}</div>`;
}

type RenderContext = { branchId: number };

// Walk the (possibly nested) steps in source order, emitting one `<li>` per row. Branches emit
// an `if` header row, their true-arm rows (one level deeper), then — if present — an `else`
// row and the false-arm rows. Each arm tags its rows with `<branchId>:t` / `<branchId>:f` so
// the simulator can later dim whichever arm a payload does not take.
function renderSteps(steps: FlowStep[], depth: number, ancestors: string[], ctx: RenderContext): string[] {
  const out: string[] = [];
  for (const step of steps) {
    if (step.kind === "branch") {
      const id = `b${ctx.branchId++}`;
      out.push(branchRow(step, depth, ancestors, id));
      out.push(...renderSteps(step.whenTrue, depth + 1, [...ancestors, `${id}:t`], ctx));
      if (step.whenFalse.length > 0) {
        out.push(elseRow(depth, ancestors, id));
        out.push(...renderSteps(step.whenFalse, depth + 1, [...ancestors, `${id}:f`], ctx));
      }
      continue;
    }
    out.push(leafRow(step, depth, ancestors));
  }
  return out;
}

// Title + playback controls: a speed select and play/pause + replay buttons. The FlowPlayer
// binds behaviour off the data-fx-* hooks after render.
function head(): string {
  const speed =
    `<select class="fx-speed" data-fx-speed title="${escape(t("fx.speed"))}" aria-label="${escape(t("fx.speed"))}">` +
    `<option value="slow">${escape(t("fx.speedSlow"))}</option>` +
    `<option value="normal" selected>${escape(t("fx.speedNormal"))}</option>` +
    `<option value="fast">${escape(t("fx.speedFast"))}</option>` +
    `</select>`;
  const buttons =
    `<button type="button" class="fx-play" data-fx-toggle>${escape(t("fx.play"))}</button>` +
    `<button type="button" class="fx-btn" data-fx-replay>${escape(t("fx.replay"))}</button>`;
  return (
    `<div class="fx-head">` +
    `<span class="fx-title">${escape(t("fx.heading"))}</span>` +
    `<div class="fx-controls">${speed}${buttons}</div>` +
    `</div>`
  );
}

// One leaf row (input / call / return / throw) at the given depth.
function leafRow(step: FlowInputStep | FlowCallStep | FlowReturnStep | FlowThrowStep, depth: number, ancestors: string[]): string {
  const body =
    step.kind === "input"
      ? inputBody(step)
      : step.kind === "call"
        ? callBody(step)
        : step.kind === "return"
          ? returnBody(step)
          : throwBody(step);
  // A return/throw ends the run on the live path — tag it so the player halts there.
  const extra = step.kind === "return" || step.kind === "throw" ? ` data-fx-terminal="1"` : "";
  return row(`fx-step--${step.kind}`, depth, ancestors, extra, body);
}

// The `if <condition>` header for a branch. Carries its id and raw condition so the simulator
// can evaluate it and mark this row taken/skipped.
function branchRow(step: FlowBranchStep, depth: number, ancestors: string[], id: string): string {
  const body =
    `<span class="fx-verb">${escape(t("fx.if"))}</span> ` +
    `<code class="fx-cond">${escape(step.condition)}</code>`;
  const extra = ` data-fx-branch="${id}" data-fx-cond="${escape(step.condition)}"`;
  return row("fx-step--branch", depth, ancestors, extra, body);
}

// The `else` divider between a branch's two arms, at the branch's own depth.
function elseRow(depth: number, ancestors: string[], id: string): string {
  const body = `<span class="fx-verb">${escape(t("fx.else"))}</span>`;
  return row("fx-step--else", depth, ancestors, ` data-fx-else="${id}"`, body);
}

// Assemble a row: the nesting depth drives indentation (`--fx-depth`), the ancestor chain
// (`data-fx-anc`) records which branch arms it sits inside, and `extra` carries any per-kind
// hooks. Every row has a dot marker and a text line.
function row(kind: string, depth: number, ancestors: string[], extra: string, body: string): string {
  const anc = ancestors.length > 0 ? ` data-fx-anc="${escape(ancestors.join("|"))}"` : "";
  return (
    `<li class="fx-step ${kind}" style="--fx-depth:${depth}"${anc}${extra}>` +
    `<span class="fx-dot"></span><span class="fx-line">${body}</span></li>`
  );
}

function inputBody(step: FlowInputStep): string {
  const chips = step.params
    .map((param) => `<span class="fx-param"><code class="fx-arg">${escape(param)}</code></span>`)
    .join(", ");
  return `<span class="fx-verb">${escape(t("fx.inputs"))}</span> ${chips}`;
}

function callBody(step: FlowCallStep): string {
  const target = step.receiver
    ? `<code class="fx-recv">${escape(step.receiver)}</code>.<code class="fx-callee">${escape(step.callee)}</code>`
    : `<code class="fx-callee">${escape(step.callee)}</code>`;
  const args = `(<span class="fx-args">${step.args.map((arg) => `<code class="fx-arg">${escape(arg)}</code>`).join(", ")}</span>)`;
  const verb = step.awaited ? t("fx.awaits") : t("fx.calls");
  const capture = step.assignsTo
    ? ` <span class="fx-into">${escape(t("fx.into"))}</span> <code class="fx-capture">${escape(step.assignsTo)}</code>`
    : "";
  return `<span class="fx-verb">${escape(verb)}</span> ${target}${args}${capture}`;
}

function returnBody(step: FlowReturnStep): string {
  return `<span class="fx-verb">${escape(t("fx.returns"))}</span> <code class="fx-return">${escape(step.expression)}</code>`;
}

function throwBody(step: FlowThrowStep): string {
  return `<span class="fx-verb">${escape(t("fx.throws"))}</span> <code class="fx-throw">${escape(step.expression)}</code>`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
