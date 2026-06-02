// The language-variant decisions the run-flow scan needs, factored out of the otherwise
// language-agnostic FlowAnalyzer. The analyzer's structure — masking strings/comments, walking
// statements, nesting `if` arms, flattening loops, capturing call sites — is shared; only the
// few places where syntax actually differs between languages are delegated here.
//
// `CLikeFlowAdapter` is the default and reproduces the original brace+paren behaviour exactly,
// so TypeScript, Java and C# (and any unknown file) are analyzed just as before. `GoFlowAdapter`
// overrides the handful of points where Go diverges (paren-less `if` conditions, `:=` capture,
// and the absence of `throw`). New languages register their own adapter without touching the
// analyzer — the same Open/Closed seam the extraction layer already uses via LanguageRegistry.

export type TerminalKind = "return" | "throw";

export interface FlowLanguageAdapter {
  readonly id: string;
  // Identifier names that are control keywords, not real calls (`if (…)`, `for (…)`, …), so the
  // call scan skips them.
  readonly keywords: ReadonlySet<string>;
  // Block-introducing keywords whose bodies are flattened (their inner calls still show in order)
  // but whose construct isn't modelled as its own step — loops, `try`/`catch`, `switch`, …
  readonly flattened: ReadonlySet<string>;
  // Whether a newline (at bracket depth 0) ends a statement. False for the C family, which relies
  // on `;`; true for Go, which is semicolon-free, so without this the first statement would
  // swallow the rest of the body.
  readonly newlineEndsStatement: boolean;
  // A statement-leading keyword mapped to the terminal step it produces, or null when it isn't a
  // terminal in this language (Go has no `throw`).
  terminalKind(word: string): TerminalKind | null;
  // Parse an `if` head starting at `ifIndex` (the 'i'). Returns the condition's [start,end) range
  // in the source and where the consequent clause begins, or null when the head is malformed.
  // Captures `if (cond)` (C-like) vs `if cond {` (Go).
  ifHead(masked: string, ifIndex: number, end: number): IfHead | null;
  // The variable a call's result is captured into, read from the text just left of the callee
  // (`const x =`, `x :=`, `this.cache =`); null when the result is discarded.
  assignsTo(lead: string): string | null;
}

export type IfHead = { conditionStart: number; conditionEnd: number; clauseStart: number };

// Index of the closing bracket matching the opener at `open`, depth-aware; -1 if unbalanced.
// Works for any (opener, closer) pair so it serves parens, braces and brackets alike.
export function matchBracket(text: string, open: number, opener: string, closer: string): number {
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

// `const booking = …` / `let x = …` / `var y = …` — a freshly declared local capturing the call.
function capturedDeclaration(lead: string): string | null {
  const declared = /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+)?[\w$\s.?]*$/.exec(lead);
  return declared?.[1] ?? null;
}

// `this.cache = …` / `result = …` — an assignment into an existing binding (possibly a member).
function capturedReassignment(lead: string): string | null {
  const reassigned = /([\w$]+(?:\.[\w$]+)*)\s*=\s*(?:await\s+)?[\w$\s.?]*$/.exec(lead);
  return reassigned?.[1] ?? null;
}

// `booking := …` / `a, b := …` — Go's short variable declaration; captures the first name bound.
function capturedShortDeclaration(lead: string): string | null {
  const short = /([\w$]+)(?:\s*,\s*[\w$]+)*\s*:=\s*[\w$\s.?]*$/.exec(lead);
  return short?.[1] ?? null;
}

// The C-family default: brace/paren syntax, `if (cond)`, `throw` is a terminal, `const/let/var`
// (or a reassignment) captures a result. Reproduces the analyzer's original behaviour.
class CLikeFlowAdapter implements FlowLanguageAdapter {
  readonly id = "c-like";
  readonly keywords = new Set([
    "if", "for", "while", "switch", "catch", "return", "function", "do", "else", "with", "await", "typeof", "throw",
  ]);
  readonly flattened = new Set(["for", "while", "switch", "try", "catch", "finally", "do"]);
  readonly newlineEndsStatement = false;

  terminalKind(word: string): TerminalKind | null {
    return word === "return" ? "return" : word === "throw" ? "throw" : null;
  }

  ifHead(masked: string, ifIndex: number, end: number): IfHead | null {
    const parenOpen = masked.indexOf("(", ifIndex + 2);
    if (parenOpen < 0 || parenOpen >= end) {
      return null;
    }
    const parenClose = matchBracket(masked, parenOpen, "(", ")");
    if (parenClose < 0) {
      return null;
    }
    return { conditionStart: parenOpen + 1, conditionEnd: parenClose, clauseStart: parenClose + 1 };
  }

  assignsTo(lead: string): string | null {
    return capturedDeclaration(lead) ?? capturedReassignment(lead);
  }
}

// Go: conditions carry no parentheses and end at the body brace (`if x > 2 {`); there is no
// `throw` (a failure is `panic(...)`, which stays a normal call step, or a returned error); the
// short declaration `:=` captures results (with `=` reassignment as the fallback). Loops are all
// `for`; `select`/`switch` flatten like their C-like cousins.
class GoFlowAdapter implements FlowLanguageAdapter {
  readonly id = "go";
  readonly keywords = new Set([
    "if", "for", "switch", "select", "return", "func", "go", "defer", "range", "else", "case", "default", "map",
  ]);
  readonly flattened = new Set(["for", "switch", "select"]);
  readonly newlineEndsStatement = true;

  terminalKind(word: string): TerminalKind | null {
    return word === "return" ? "return" : null;
  }

  ifHead(masked: string, ifIndex: number, end: number): IfHead | null {
    const conditionStart = ifIndex + 2;
    let depth = 0;
    for (let index = conditionStart; index < end; index += 1) {
      const char = masked.charAt(index);
      if (char === "(" || char === "[") {
        depth += 1;
      } else if (char === ")" || char === "]") {
        depth -= 1;
      } else if (char === "{" && depth === 0) {
        return { conditionStart, conditionEnd: index, clauseStart: index };
      }
    }
    return null;
  }

  assignsTo(lead: string): string | null {
    return capturedShortDeclaration(lead) ?? capturedReassignment(lead);
  }
}

const C_LIKE = new CLikeFlowAdapter();
const GO = new GoFlowAdapter();

// The default adapter — used for TypeScript, Java, C# and any file whose language we don't
// special-case. Reproduces the original analyzer behaviour.
export const defaultFlowAdapter: FlowLanguageAdapter = C_LIKE;

// Pick the flow adapter for a file by extension. Unknown/missing → the C-like default, so the
// drawer keeps working even when it doesn't pass a file path.
export function flowAdapterForFile(file?: string): FlowLanguageAdapter {
  if (file && /\.go$/i.test(file)) {
    return GO;
  }
  return C_LIKE;
}
