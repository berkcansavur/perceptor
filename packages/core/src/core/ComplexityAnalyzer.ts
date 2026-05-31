import type { ComplexityReport, ComplexityScale } from "../service/types";

// Sample input sizes (as powers of ten) used to project the cost curve. ops = n^depth,
// so opsExponent = nExponent * depth — exact, no floating point.
const SAMPLE_EXPONENTS: readonly number[] = [3, 6];

// Array iteration methods whose callback runs once per element — i.e. a loop.
const ITERATORS: ReadonlySet<string> = new Set([
  "forEach",
  "map",
  "filter",
  "reduce",
  "reduceRight",
  "some",
  "every",
  "find",
  "findIndex",
  "flatMap",
]);

const LOOP_KEYWORDS: ReadonlySet<string> = new Set(["for", "while", "do"]);

// Static complexity metrics for a single method. Pure and deterministic: the same code
// always yields the same numbers, and every number is either an exact count or an exact
// power-of-ten projection. Big-O is inferred from loop nesting (the UI labels it as
// such). Language-agnostic over TS/Java/C# since it keys off shared syntax (braces,
// for/while/do, &&/||/?, and JS/TS iteration methods).
export class ComplexityAnalyzer {
  analyze(code: string, methodName: string): ComplexityReport {
    const clean = this.stripNonCode(code);
    const loopDepth = this.loopDepth(clean);
    const recursive = this.isRecursive(clean, methodName);
    return {
      bigO: this.bigO(loopDepth, recursive),
      cyclomatic: this.cyclomatic(clean),
      loopDepth,
      recursive,
      loc: this.linesOfCode(code),
      scale: this.scale(loopDepth, recursive),
    };
  }

  // Blank out comments and string/template literals so their contents never count as
  // keywords, braces or calls.
  private stripNonCode(code: string): string {
    let out = "";
    let index = 0;
    while (index < code.length) {
      const char = code.charAt(index);
      const next = code.charAt(index + 1);
      if (char === "/" && next === "/") {
        index += 2;
        while (index < code.length && code.charAt(index) !== "\n") {
          index += 1;
        }
        continue;
      }
      if (char === "/" && next === "*") {
        index += 2;
        while (index < code.length && !(code.charAt(index) === "*" && code.charAt(index + 1) === "/")) {
          index += 1;
        }
        index += 2;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        index = this.skipString(code, index);
        out += '""';
        continue;
      }
      out += char;
      index += 1;
    }
    return out;
  }

  private skipString(code: string, start: number): number {
    const quote = code.charAt(start);
    let index = start + 1;
    while (index < code.length && code.charAt(index) !== quote) {
      index += this.charAt(code, index) === "\\" ? 2 : 1;
    }
    return index + 1;
  }

  private charAt(code: string, index: number): string {
    return code.charAt(index);
  }

  // Max nesting of loop scopes. A `{` block is a loop body when it follows a for/while/do
  // header; a `(` is a loop when it's the callback of an array-iteration method. Single
  // counter tracks how many loop scopes are currently open; we remember the deepest.
  private loopDepth(clean: string): number {
    const stack: boolean[] = [];
    let depth = 0;
    let max = 0;
    let pendingBlockLoop = false;
    let pendingCallLoop = false;
    let afterDot = false;
    let index = 0;
    while (index < clean.length) {
      const char = clean.charAt(index);
      if (this.isIdentifierStart(char)) {
        const end = this.identifierEnd(clean, index);
        const word = clean.slice(index, end);
        if (afterDot && ITERATORS.has(word)) {
          pendingCallLoop = true;
        } else if (!afterDot && LOOP_KEYWORDS.has(word)) {
          pendingBlockLoop = true;
        }
        afterDot = false;
        index = end;
        continue;
      }
      if (char === ".") {
        afterDot = true;
        index += 1;
        continue;
      }
      if (char === "(") {
        const isLoop = pendingCallLoop;
        pendingCallLoop = false;
        depth = this.openScope(stack, isLoop, depth);
        max = Math.max(max, depth);
        afterDot = false;
        index += 1;
        continue;
      }
      if (char === "{") {
        const isLoop = pendingBlockLoop;
        pendingBlockLoop = false;
        depth = this.openScope(stack, isLoop, depth);
        max = Math.max(max, depth);
        afterDot = false;
        index += 1;
        continue;
      }
      if (char === ")" || char === "}") {
        depth = this.closeScope(stack, depth);
        afterDot = false;
        index += 1;
        continue;
      }
      if (!this.isWhitespace(char)) {
        afterDot = false;
      }
      index += 1;
    }
    return max;
  }

  private openScope(stack: boolean[], isLoop: boolean, depth: number): number {
    stack.push(isLoop);
    return isLoop ? depth + 1 : depth;
  }

  private closeScope(stack: boolean[], depth: number): number {
    return stack.pop() === true ? depth - 1 : depth;
  }

  // Exact: one decision point per branch keyword, boolean operator, ternary, and
  // iteration callback, plus the base path.
  private cyclomatic(clean: string): number {
    const branches = this.count(clean, /(?<![.\w$])(?:if|for|while|case|catch)(?![\w$])/g);
    const logical = this.count(clean, /&&|\|\|/g);
    const ternary = this.count(clean, /(?<!\?)\?(?!\s*[,):.?])/g);
    const iterators = this.count(clean, /\.(?:forEach|map|filter|reduce|reduceRight|some|every|find|findIndex|flatMap)\s*\(/g);
    return 1 + branches + logical + ternary + iterators;
  }

  // The method calls itself: its name appears as a call somewhere beyond its own
  // declaration (the first occurrence). Needs a name; anonymous code is never recursive.
  private isRecursive(clean: string, methodName: string): boolean {
    if (!methodName) {
      return false;
    }
    const calls = this.count(clean, new RegExp(`\\b${this.escape(methodName)}\\s*\\(`, "g"));
    return calls > 1;
  }

  private bigO(loopDepth: number, recursive: boolean): string {
    if (recursive) {
      return "O(?)";
    }
    if (loopDepth <= 0) {
      return "O(1)";
    }
    if (loopDepth === 1) {
      return "O(n)";
    }
    return `O(n^${loopDepth})`;
  }

  private scale(loopDepth: number, recursive: boolean): ComplexityScale[] {
    if (recursive || loopDepth < 1) {
      return [];
    }
    return SAMPLE_EXPONENTS.map((nExponent) => ({ nExponent, opsExponent: nExponent * loopDepth }));
  }

  private linesOfCode(code: string): number {
    return code.split("\n").filter((line) => this.isCodeLine(line)).length;
  }

  private isCodeLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  }

  private count(text: string, pattern: RegExp): number {
    return (text.match(pattern) ?? []).length;
  }

  private isIdentifierStart(char: string): boolean {
    return /[A-Za-z_$]/.test(char);
  }

  private identifierEnd(text: string, start: number): number {
    let index = start + 1;
    while (index < text.length && /[A-Za-z0-9_$]/.test(text.charAt(index))) {
      index += 1;
    }
    return index;
  }

  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  private escape(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
