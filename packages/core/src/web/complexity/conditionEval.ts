// A tiny, SAFE evaluator for the boolean conditions that drive `if` branches in the run-flow
// storyboard. It never uses `eval`/`Function` — it tokenises, parses a small expression
// grammar (logical / equality / relational / unary-not over member paths and literals) and
// evaluates it against a payload environment the user edits. Anything it can't resolve (an
// unknown variable, an unsupported operator, a syntax it doesn't model) collapses to
// "unknown" so the UI honestly shows "both paths" rather than guessing.

// A resolved value. `present` means "some non-null value exists" (a call stubbed to "value")
// — truthy, but its exact contents are unknown, so equality comparisons against it are
// unknown. `unknown` means we have no information at all.
export type Val =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "null" }
  | { t: "present" }
  | { t: "unknown" };

export type Tri = "true" | "false" | "unknown";

export type Env = Record<string, Val>;

// Evaluate a condition's truthiness against the environment. Returns "unknown" on any parse
// failure or unresolved input — the caller treats that as "can't decide, show both arms".
export function evalCondition(condition: string, env: Env): Tri {
  let ast: Node | null;
  try {
    ast = new Parser(condition).parse();
  } catch {
    return "unknown";
  }
  if (!ast) {
    return "unknown";
  }
  return truthy(evalNode(ast, env));
}

// The distinct member paths / identifiers a condition references (e.g. `req.isRestricted`,
// `url`, `stops.length`). Used to build the payload form: each ref becomes a field or a stub.
// Returns [] when the condition can't be parsed.
export function collectRefs(condition: string): string[] {
  let ast: Node | null;
  try {
    ast = new Parser(condition).parse();
  } catch {
    return [];
  }
  const out: string[] = [];
  walk(ast, (node) => {
    if (node && node.kind === "ref" && !out.includes(node.path)) {
      out.push(node.path);
    }
  });
  return out;
}

// ── AST ──────────────────────────────────────────────────────────────────────────────────

type Node =
  | { kind: "lit"; val: Val }
  | { kind: "ref"; path: string }
  | { kind: "not"; expr: Node }
  | { kind: "bin"; op: string; left: Node; right: Node };

function walk(node: Node | null, visit: (node: Node | null) => void): void {
  if (!node) {
    return;
  }
  visit(node);
  if (node.kind === "not") {
    walk(node.expr, visit);
  } else if (node.kind === "bin") {
    walk(node.left, visit);
    walk(node.right, visit);
  }
}

// ── Evaluation ───────────────────────────────────────────────────────────────────────────

function evalNode(node: Node, env: Env): Val {
  switch (node.kind) {
    case "lit":
      return node.val;
    case "ref":
      return env[node.path] ?? { t: "unknown" };
    case "not": {
      const inner = truthy(evalNode(node.expr, env));
      return inner === "unknown" ? { t: "unknown" } : { t: "bool", v: inner === "false" };
    }
    case "bin":
      return evalBin(node.op, () => evalNode(node.left, env), () => evalNode(node.right, env));
  }
}

function evalBin(op: string, left: () => Val, right: () => Val): Val {
  if (op === "&&") {
    const lt = truthy(left());
    if (lt === "false") {
      return { t: "bool", v: false };
    }
    const rt = truthy(right());
    if (lt === "true") {
      return rt === "unknown" ? { t: "unknown" } : { t: "bool", v: rt === "true" };
    }
    return rt === "false" ? { t: "bool", v: false } : { t: "unknown" };
  }
  if (op === "||") {
    const lt = truthy(left());
    if (lt === "true") {
      return { t: "bool", v: true };
    }
    const rt = truthy(right());
    if (lt === "false") {
      return rt === "unknown" ? { t: "unknown" } : { t: "bool", v: rt === "true" };
    }
    return rt === "true" ? { t: "bool", v: true } : { t: "unknown" };
  }
  const lc = concrete(left());
  const rc = concrete(right());
  if (!lc.ok || !rc.ok) {
    return { t: "unknown" };
  }
  const a = lc.v;
  const b = rc.v;
  switch (op) {
    case "===":
    case "==":
      return { t: "bool", v: a === b };
    case "!==":
    case "!=":
      return { t: "bool", v: a !== b };
    case ">":
      return { t: "bool", v: (a as number) > (b as number) };
    case "<":
      return { t: "bool", v: (a as number) < (b as number) };
    case ">=":
      return { t: "bool", v: (a as number) >= (b as number) };
    case "<=":
      return { t: "bool", v: (a as number) <= (b as number) };
    default:
      return { t: "unknown" };
  }
}

function truthy(val: Val): Tri {
  switch (val.t) {
    case "num":
      return val.v !== 0 ? "true" : "false";
    case "str":
      return val.v !== "" ? "true" : "false";
    case "bool":
      return val.v ? "true" : "false";
    case "null":
      return "false";
    case "present":
      return "true";
    default:
      return "unknown";
  }
}

function concrete(val: Val): { ok: true; v: number | string | boolean | null } | { ok: false } {
  if (val.t === "num" || val.t === "str" || val.t === "bool") {
    return { ok: true, v: val.v };
  }
  if (val.t === "null") {
    return { ok: true, v: null };
  }
  return { ok: false };
}

// ── Parser ───────────────────────────────────────────────────────────────────────────────

type Token = { type: string; value: string };

// Recursive-descent over: or → and → equality → relational → unary → primary. Member paths
// (`a.b?.c`) collapse to a single dotted ref string; computed access (`a[i]`) and any token
// it doesn't recognise make it bail (the caller falls back to "unknown").
class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(source: string) {
    this.tokens = tokenize(source);
  }

  parse(): Node | null {
    if (this.tokens.length === 0) {
      return null;
    }
    const node = this.parseOr();
    if (this.pos !== this.tokens.length) {
      throw new Error("trailing tokens");
    }
    return node;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.peek()?.value === "||") {
      this.pos += 1;
      left = { kind: "bin", op: "||", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseEquality();
    while (this.peek()?.value === "&&") {
      this.pos += 1;
      left = { kind: "bin", op: "&&", left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): Node {
    let left = this.parseRelational();
    while (["===", "!==", "==", "!="].includes(this.peek()?.value ?? "")) {
      const op = this.tokens[this.pos]!.value;
      this.pos += 1;
      left = { kind: "bin", op, left, right: this.parseRelational() };
    }
    return left;
  }

  private parseRelational(): Node {
    let left = this.parseUnary();
    while ([">", "<", ">=", "<="].includes(this.peek()?.value ?? "")) {
      const op = this.tokens[this.pos]!.value;
      this.pos += 1;
      left = { kind: "bin", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.peek()?.value === "!") {
      this.pos += 1;
      return { kind: "not", expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const token = this.peek();
    if (!token) {
      throw new Error("unexpected end");
    }
    if (token.value === "(") {
      this.pos += 1;
      const node = this.parseOr();
      if (this.peek()?.value !== ")") {
        throw new Error("missing )");
      }
      this.pos += 1;
      return node;
    }
    if (token.type === "num") {
      this.pos += 1;
      return { kind: "lit", val: { t: "num", v: Number(token.value) } };
    }
    if (token.type === "str") {
      this.pos += 1;
      return { kind: "lit", val: { t: "str", v: token.value } };
    }
    if (token.type === "ident") {
      return this.parseRef();
    }
    throw new Error(`unexpected token ${token.value}`);
  }

  private parseRef(): Node {
    const first = this.tokens[this.pos]!;
    if (first.value === "true") {
      this.pos += 1;
      return { kind: "lit", val: { t: "bool", v: true } };
    }
    if (first.value === "false") {
      this.pos += 1;
      return { kind: "lit", val: { t: "bool", v: false } };
    }
    if (first.value === "null" || first.value === "undefined") {
      this.pos += 1;
      return { kind: "lit", val: { t: "null" } };
    }
    let path = first.value;
    this.pos += 1;
    while (this.peek()?.value === "." || this.peek()?.value === "?.") {
      this.pos += 1;
      const member = this.peek();
      if (!member || member.type !== "ident") {
        throw new Error("bad member");
      }
      path += `.${member.value}`;
      this.pos += 1;
    }
    return { kind: "ref", path };
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const punct = ["===", "!==", "==", "!=", ">=", "<=", "&&", "||", "?.", ">", "<", "!", "(", ")", "."];
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let value = "";
      i += 1;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === "\\") {
          value += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        value += source[i];
        i += 1;
      }
      i += 1; // closing quote
      tokens.push({ type: "str", value });
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      let value = "";
      while (i < source.length && /[0-9.]/.test(source[i]!)) {
        value += source[i];
        i += 1;
      }
      tokens.push({ type: "num", value });
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let value = "";
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i]!)) {
        value += source[i];
        i += 1;
      }
      tokens.push({ type: "ident", value });
      continue;
    }
    const matched = punct.find((p) => source.startsWith(p, i));
    if (!matched) {
      throw new Error(`unexpected char ${ch}`);
    }
    tokens.push({ type: "punct", value: matched });
    i += matched.length;
  }
  return tokens;
}
