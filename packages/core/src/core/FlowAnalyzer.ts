import type { FlowBranchStep, FlowCallStep, FlowReport, FlowStep } from "../service/types";
import { defaultFlowAdapter, type FlowLanguageAdapter } from "./flow/FlowLanguageAdapter";

// Safety ceiling on leaf steps (calls, returns, throws) — high enough that a real method's
// behaviour is shown in full (the storyboard is meant to be complete), low enough to guard
// a pathological file. Branches don't count against it; only the work inside them does.
const MAX_CALLS = 60;

// A single argument longer than this is elided in the middle so one giant inline object
// literal can't blow out the step. The call + receiver + which arg is still legible.
const MAX_ARG_LENGTH = 80;

// Builds a static "how this method runs" storyboard from source text alone: the inputs it
// takes, the ordered calls it makes (callee, args, await, captured result), and what it
// returns. Pure and deterministic — it reads structure, it never executes anything. The
// scan masks comment/string *contents* (so their parens, semicolons and `await` text never
// confuse the structure) while preserving their length, so every index maps back to the
// original text for display.
export class FlowAnalyzer {
  // The language-variant decisions for the current pass. Set per `analyze` call (the analyzer is
  // synchronous and not re-entrant across languages), defaulting to the C-like adapter so every
  // existing caller and test behaves exactly as before.
  private adapter: FlowLanguageAdapter = defaultFlowAdapter;

  analyze(code: string, methodName: string, adapter: FlowLanguageAdapter = defaultFlowAdapter): FlowReport {
    this.adapter = adapter;
    const masked = this.mask(code);
    const params = this.params(code, masked, methodName);
    const body = this.bodyRange(masked, methodName);
    const steps: FlowStep[] = [];
    if (params.length > 0) {
      steps.push({ kind: "input", params });
    }
    const budget = { count: 0 };
    const tree = this.prune(this.parseBlock(code, masked, body.start, body.end, budget));
    steps.push(...tree);
    // A lone input step (no calls/returns/throws/branches) isn't a story worth animating.
    return { steps: this.hasFlow(steps) ? steps : [] };
  }

  // True only when there's actual behaviour to show — a call, a return, a throw, or a branch
  // that itself contains behaviour. A bare input chip (or an empty branch) is not a story.
  private hasFlow(steps: FlowStep[]): boolean {
    return steps.some(
      (step) =>
        step.kind === "call" ||
        step.kind === "return" ||
        step.kind === "throw" ||
        (step.kind === "branch" && (this.hasFlow(step.whenTrue) || this.hasFlow(step.whenFalse)))
    );
  }

  // Drop branches whose both arms carry no behaviour (e.g. an `if` that only reassigns a
  // local) so the storyboard stays about calls/returns/throws — clean, no empty scaffolding.
  private prune(steps: FlowStep[]): FlowStep[] {
    const out: FlowStep[] = [];
    for (const step of steps) {
      if (step.kind === "branch") {
        const whenTrue = this.prune(step.whenTrue);
        const whenFalse = this.prune(step.whenFalse);
        if (this.hasFlow(whenTrue) || this.hasFlow(whenFalse)) {
          out.push({ kind: "branch", condition: step.condition, whenTrue, whenFalse });
        }
        continue;
      }
      out.push(step);
    }
    return out;
  }

  // Walk a block's statements in source order, building the nested storyboard: `if/else`
  // becomes a branch (with its arms recursively parsed), `return`/`throw` become their own
  // steps, loops/try/switch are flattened (their inner calls still show), and every other
  // statement contributes its call sites. `end` bounds the block (the matching `}`).
  private parseBlock(
    code: string,
    masked: string,
    start: number,
    end: number,
    budget: { count: number }
  ): FlowStep[] {
    const steps: FlowStep[] = [];
    let i = start;
    while (i < end && budget.count < MAX_CALLS) {
      i = this.skipTrivia(masked, i, end);
      if (i >= end || masked.charAt(i) === "}") {
        break;
      }
      const result = this.parseStatement(code, masked, i, end, budget);
      steps.push(...result.steps);
      i = result.next > i ? result.next : i + 1; // never stall
    }
    return steps;
  }

  // Parse exactly one statement starting at `i` (already trivia-skipped). Returns the steps
  // it produced and the index just past it.
  private parseStatement(
    code: string,
    masked: string,
    i: number,
    end: number,
    budget: { count: number }
  ): { steps: FlowStep[]; next: number } {
    const char = masked.charAt(i);
    if (char === ";") {
      return { steps: [], next: i + 1 };
    }
    if (char === "{") {
      const close = this.matchBracket(masked, i, "{", "}");
      const blockEnd = close < 0 || close > end ? end : close;
      return { steps: this.parseBlock(code, masked, i + 1, blockEnd, budget), next: blockEnd + 1 };
    }
    const word = this.wordAt(masked, i);
    if (word === "if") {
      const branch = this.parseIf(code, masked, i, end, budget);
      return { steps: branch.step ? [branch.step] : [], next: branch.next };
    }
    if (this.adapter.flattened.has(word)) {
      return this.parseConstruct(code, masked, i, word, end, budget);
    }
    const terminal = this.adapter.terminalKind(word);
    if (terminal) {
      const exprStart = i + word.length;
      const stmtEnd = this.statementEnd(masked, exprStart);
      const expression = code.slice(exprStart, stmtEnd).trim().replace(/\s+/g, " ");
      const steps: FlowStep[] = [];
      if (expression.length > 0) {
        budget.count += 1;
        steps.push(
          terminal === "return" ? { kind: "return", expression } : { kind: "throw", expression }
        );
      }
      return { steps, next: stmtEnd + 1 };
    }
    // A plain expression statement (assignment, bare call, …): collect its call sites.
    const stmtEnd = this.statementEnd(masked, i);
    return { steps: this.callsInRange(code, masked, i, stmtEnd, budget), next: stmtEnd + 1 };
  }

  // Parse `if (cond) <clause> [else <clause>]` into a branch. `else if` recurses, landing the
  // chained branch as the single step of `whenFalse` so the tree mirrors the source nesting.
  private parseIf(
    code: string,
    masked: string,
    ifIndex: number,
    end: number,
    budget: { count: number }
  ): { step: FlowBranchStep | null; next: number } {
    const head = this.adapter.ifHead(masked, ifIndex, end);
    if (!head) {
      return { step: null, next: ifIndex + 2 };
    }
    const condition = code.slice(head.conditionStart, head.conditionEnd).trim().replace(/\s+/g, " ");
    const consequent = this.parseClause(code, masked, head.clauseStart, end, budget);
    let whenFalse: FlowStep[] = [];
    let next = consequent.next;
    const elseIndex = this.skipTrivia(masked, consequent.next, end);
    if (this.wordAt(masked, elseIndex) === "else") {
      const afterElse = elseIndex + "else".length;
      const nextWord = this.skipTrivia(masked, afterElse, end);
      if (this.wordAt(masked, nextWord) === "if") {
        const chained = this.parseIf(code, masked, nextWord, end, budget);
        whenFalse = chained.step ? [chained.step] : [];
        next = chained.next;
      } else {
        const alternate = this.parseClause(code, masked, afterElse, end, budget);
        whenFalse = alternate.steps;
        next = alternate.next;
      }
    }
    return { step: { kind: "branch", condition, whenTrue: consequent.steps, whenFalse }, next };
  }

  // A branch arm: either a braced `{ … }` block or a single unbraced statement. Returns the
  // arm's steps and where parsing should resume.
  private parseClause(
    code: string,
    masked: string,
    from: number,
    end: number,
    budget: { count: number }
  ): { steps: FlowStep[]; next: number } {
    const i = this.skipTrivia(masked, from, end);
    if (i >= end) {
      return { steps: [], next: end };
    }
    if (masked.charAt(i) === "{") {
      const close = this.matchBracket(masked, i, "{", "}");
      const blockEnd = close < 0 || close > end ? end : close;
      return { steps: this.parseBlock(code, masked, i + 1, blockEnd, budget), next: blockEnd + 1 };
    }
    return this.parseStatement(code, masked, i, end, budget);
  }

  // A flattened construct (loop/try/switch/do): skip its keyword and any condition paren,
  // then descend into its `{ … }` body so inner calls still appear in order. If it has no
  // block (e.g. `do … while(x);` tail, or a single-statement loop body), fall back to parsing
  // the one statement that follows.
  private parseConstruct(
    code: string,
    masked: string,
    i: number,
    word: string,
    end: number,
    budget: { count: number }
  ): { steps: FlowStep[]; next: number } {
    let j = i + word.length;
    while (j < end) {
      const char = masked.charAt(j);
      if (char === "(") {
        const close = this.matchParen(masked, j);
        if (close < 0) {
          break;
        }
        j = close + 1;
        continue;
      }
      if (char === "{") {
        const close = this.matchBracket(masked, j, "{", "}");
        const blockEnd = close < 0 || close > end ? end : close;
        return { steps: this.parseBlock(code, masked, j + 1, blockEnd, budget), next: blockEnd + 1 };
      }
      if (char === ";") {
        return { steps: [], next: j + 1 };
      }
      if (char === "}") {
        break;
      }
      if (/\s/.test(char)) {
        j += 1;
        continue;
      }
      // A single-statement body with no braces (`for (…) doThing();`).
      return this.parseClause(code, masked, j, end, budget);
    }
    return { steps: [], next: j };
  }

  // Skip whitespace (comments are already masked to spaces) from `i` up to `end`.
  private skipTrivia(masked: string, i: number, end: number): number {
    let position = i;
    while (position < end && /\s/.test(masked.charAt(position))) {
      position += 1;
    }
    return position;
  }

  // The identifier word starting exactly at `i`, or "" if there isn't one. Used to recognise
  // statement-leading keywords (`if`, `return`, `throw`, loop heads) without a global scan.
  private wordAt(masked: string, i: number): string {
    const match = /^[\w$]+/.exec(masked.slice(i, i + 24));
    return match?.[0] ?? "";
  }

  // Replace comment and string-literal *contents* with spaces, preserving every character
  // position (and the quote delimiters), so the masked string is a structural skeleton the
  // scan can trust while original-text slices stay valid for display.
  private mask(code: string): string {
    const out = code.split("");
    let position = 0;
    const length = code.length;
    while (position < length) {
      const char = code.charAt(position);
      const next = code.charAt(position + 1);
      if (char === "/" && next === "/") {
        while (position < length && code.charAt(position) !== "\n") {
          out[position] = " ";
          position += 1;
        }
        continue;
      }
      if (char === "/" && next === "*") {
        out[position] = " ";
        out[position + 1] = " ";
        position += 2;
        while (position < length && !(code.charAt(position) === "*" && code.charAt(position + 1) === "/")) {
          out[position] = " ";
          position += 1;
        }
        if (position < length) {
          out[position] = " ";
          out[position + 1] = " ";
          position += 2;
        }
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        position += 1; // keep the opening quote in place
        while (position < length && code.charAt(position) !== char) {
          if (code.charAt(position) === "\\") {
            out[position] = " ";
            out[position + 1] = " ";
            position += 2;
            continue;
          }
          out[position] = " ";
          position += 1;
        }
        position += 1; // keep the closing quote
        continue;
      }
      position += 1;
    }
    return out.join("");
  }

  // The method's declared parameters, by name. Finds `name(` (the header), captures the
  // balanced parameter list, splits it at top level, and reduces each entry to its binding
  // name (dropping `: Type`, `= default`, and modifiers). Returns [] if no header is found.
  private params(code: string, masked: string, methodName: string): string[] {
    if (!methodName) {
      return [];
    }
    const header = new RegExp(`(?<![\\w$])${this.escape(methodName)}\\s*\\(`).exec(masked);
    if (!header) {
      return [];
    }
    const open = header.index + header[0].length - 1;
    const close = this.matchParen(masked, open);
    if (close < 0) {
      return [];
    }
    return this.splitTopLevel(code.slice(open + 1, close)).flatMap((entry) => this.paramNames(entry));
  }

  // The binding name(s) a parameter introduces — what the body can actually reference. A
  // plain `dto: Dto` yields `["dto"]`; a destructured `{ requestDto, stops = [] }: Type`
  // yields `["requestDto", "stops"]` (the type annotation after the `}` is dropped, and
  // defaults/renames are stripped); an array destructure `[a, b]` yields `["a", "b"]`.
  private paramNames(entry: string): string[] {
    const trimmed = entry.replace(/^[@\s]+/, "").replace(/^\.\.\./, "").trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const close = trimmed.startsWith("{")
        ? this.matchBracket(trimmed, 0, "{", "}")
        : this.matchBracket(trimmed, 0, "[", "]");
      if (close < 0) {
        return [];
      }
      return this.splitTopLevel(trimmed.slice(1, close))
        .map((binding) => this.bindingName(binding))
        .filter((name) => name.length > 0);
    }
    const match = /^(?:readonly\s+|public\s+|private\s+|protected\s+)*([\w$]+)/.exec(trimmed);
    return match?.[1] ? [match[1]] : [];
  }

  // The local name a single destructure binding introduces: `a` → `a`, `a = 1` → `a`,
  // `a: b` (rename) → `b`, `a: { c }` (nested) → `c`.
  private bindingName(binding: string): string {
    const trimmed = binding.trim();
    const renamed = /:\s*([\s\S]+)$/.exec(trimmed.split("=")[0] ?? trimmed);
    const target = renamed?.[1]?.trim() ?? trimmed;
    if (target.startsWith("{") || target.startsWith("[")) {
      const close = target.startsWith("{")
        ? this.matchBracket(target, 0, "{", "}")
        : this.matchBracket(target, 0, "[", "]");
      const inner = close > 0 ? target.slice(1, close) : target.slice(1);
      return this.splitTopLevel(inner)
        .map((nested) => this.bindingName(nested))
        .filter(Boolean)
        .join(", ");
    }
    const match = /^([\w$]+)/.exec(target.replace(/^\.\.\./, ""));
    return match?.[1] ?? "";
  }

  // The body's character range: from just after the header's opening `{` to its matching
  // `}`. The tricky part is finding the *body* brace: a return-type annotation can carry its
  // own braces (`): Promise<{ booking: … }>` or `): { a: number }`), so the first `{` after
  // the parameter list is often the return type's, not the body's. Because `code` is the
  // method's own source slice, the method's closing brace is the final `}`; the body brace is
  // therefore the first `{` after the params whose match is that final `}`. Falls back to the
  // whole string when there's no recognizable header/brace.
  private bodyRange(masked: string, methodName: string): { start: number; end: number } {
    if (methodName) {
      const header = new RegExp(`(?<![\\w$])${this.escape(methodName)}\\s*\\(`).exec(masked);
      if (header) {
        const close = this.matchParen(masked, header.index + header[0].length - 1);
        if (close >= 0) {
          const lastClose = masked.lastIndexOf("}");
          let brace = masked.indexOf("{", close);
          while (brace >= 0 && brace < lastClose) {
            if (this.matchBracket(masked, brace, "{", "}") === lastClose) {
              return { start: brace + 1, end: lastClose };
            }
            brace = masked.indexOf("{", brace + 1);
          }
        }
      }
    }
    return { start: 0, end: masked.length };
  }

  // Collect every call site within `[from, to)` — an identifier immediately followed by `(`.
  // For each, read the callee, the receiver chain to its left (or null for a bare call), the
  // balanced argument list, whether it's `await`ed, and the variable it's assigned to.
  // Keyword calls (`if`, `for`, …) are skipped; the shared budget caps the storyboard.
  private callsInRange(
    code: string,
    masked: string,
    from: number,
    to: number,
    budget: { count: number }
  ): FlowCallStep[] {
    const steps: FlowCallStep[] = [];
    // The callee is the identifier right before a `(`. A preceding `.` is fine (it's a
    // member call — the receiver), but a preceding word char would mean we're mid-identifier.
    const callRe = /(?<![\w$])([\w$]+)\s*\(/g;
    callRe.lastIndex = from;
    let match: RegExpExecArray | null;
    while ((match = callRe.exec(masked)) !== null) {
      if (match.index >= to || budget.count >= MAX_CALLS) {
        break;
      }
      const callee = match[1] ?? "";
      if (this.adapter.keywords.has(callee)) {
        continue;
      }
      const calleeStart = match.index;
      const open = match.index + match[0].length - 1;
      const close = this.matchParen(masked, open);
      if (close < 0) {
        continue;
      }
      const stmtStart = this.statementStart(masked, calleeStart);
      const lead = masked.slice(stmtStart, calleeStart);
      budget.count += 1;
      steps.push({
        kind: "call",
        receiver: this.receiver(lead),
        callee,
        args: this.splitTopLevel(code.slice(open + 1, close))
          .map((arg) => this.elide(arg.replace(/\s+/g, " ").trim()))
          .filter(Boolean),
        awaited: /\bawait\s+[\w$\s.?]*$/.test(lead),
        assignsTo: this.adapter.assignsTo(lead),
      });
    }
    return steps;
  }

  // The dotted object a call lands on, read from the text just left of the callee: for
  // `this.driverPickupService.pickup(` the lead ends `this.driverPickupService.` → receiver
  // is `this.driverPickupService`. A bare call (`helper(`) has no trailing chain → null.
  private receiver(lead: string): string | null {
    const match = /([\w$]+(?:\s*\??\.\s*[\w$]+)*)\s*\??\.\s*$/.exec(lead);
    return match?.[1] ? match[1].replace(/\s+/g, "") : null;
  }

  // Index just after the statement boundary (`;`, `{` or `}`) preceding `position`, i.e.
  // where the current statement begins. 0 when none precedes it.
  private statementStart(masked: string, position: number): number {
    const newlineEnds = this.adapter.newlineEndsStatement;
    for (let index = position - 1; index >= 0; index -= 1) {
      const char = masked.charAt(index);
      if (char === ";" || char === "{" || char === "}" || (newlineEnds && char === "\n")) {
        return index + 1;
      }
    }
    return 0;
  }

  // Index of the top-level boundary ending the statement that starts at `from` (depth-aware over
  // (), [] and {}), or the end of the string if none. The boundary is `;` everywhere and, for
  // semicolon-free languages (Go), also a newline at depth 0.
  private statementEnd(masked: string, from: number): number {
    const newlineEnds = this.adapter.newlineEndsStatement;
    let depth = 0;
    for (let index = from; index < masked.length; index += 1) {
      const char = masked.charAt(index);
      if (char === "(" || char === "[" || char === "{") {
        depth += 1;
      } else if (char === ")" || char === "]" || char === "}") {
        if (depth === 0) {
          return index;
        }
        depth -= 1;
      } else if (char === ";" && depth === 0) {
        return index;
      } else if (newlineEnds && char === "\n" && depth === 0) {
        return index;
      }
    }
    return masked.length;
  }

  // Index of the `)` matching the `(` at `open`, depth-aware; -1 if unbalanced.
  private matchParen(masked: string, open: number): number {
    return this.matchBracket(masked, open, "(", ")");
  }

  // Index of the closing bracket matching the opener at `open`, depth-aware; -1 if
  // unbalanced. Works for any (open, close) pair so it serves parens, braces and brackets.
  private matchBracket(text: string, open: number, opener: string, closer: string): number {
    let depth = 0;
    for (let index = open; index < text.length; index += 1) {
      const char = text.charAt(index);
      if (char === opener) {
        depth += 1;
      } else if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }
    return -1;
  }

  // Shorten an over-long argument by eliding its middle, so one giant inline object literal
  // doesn't dominate a step while the start/end stay recognisable.
  private elide(arg: string): string {
    if (arg.length <= MAX_ARG_LENGTH) {
      return arg;
    }
    const head = arg.slice(0, MAX_ARG_LENGTH - 12).trimEnd();
    const tail = arg.slice(-8).trimStart();
    return `${head} … ${tail}`;
  }

  // Split a parameter/argument list at top-level commas only — commas nested inside (), [],
  // {} or <> (generics) belong to a single entry and don't split it.
  private splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (let index = 0; index < text.length; index += 1) {
      const char = text.charAt(index);
      if (char === "(" || char === "[" || char === "{" || char === "<") {
        depth += 1;
      } else if (char === ")" || char === "]" || char === "}" || char === ">") {
        depth -= 1;
      }
      if (char === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    if (current.trim().length > 0) {
      parts.push(current);
    }
    return parts;
  }

  private escape(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
