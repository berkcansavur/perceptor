import type { ComplexityReport, ComplexityScale } from "../service/types";
import { type ComplexityProfile, profileForFile } from "./complexityProfiles";

// Sample input sizes (as powers of ten) used to project the cost curve. ops = n^depth,
// so opsExponent = nExponent * depth — exact, no floating point.
const SAMPLE_EXPONENTS: readonly number[] = [3, 6];

// Static complexity metrics for a single method. Pure and deterministic: the same code
// always yields the same numbers, and every number is either an exact count or an exact
// power-of-ten projection. Big-O is inferred from loop nesting (the UI labels it as such).
//
// The *structure* it walks is language-agnostic (braces, parenthesised headers, do/while,
// &&/||/?), but the loop/iterator/branch vocabularies are language-specific — JS array
// methods vs Java Stream ops vs C# LINQ + `foreach`. Those come from a ComplexityProfile
// resolved from the file's extension; with no path it falls back to the TS/JS profile.
export class ComplexityAnalyzer {
  analyze(code: string, methodName: string, filePath?: string): ComplexityReport {
    const profile = profileForFile(filePath);
    const clean = this.stripNonCode(code);
    const loopDepth = this.loopDepth(clean, profile);
    const recursive = this.isRecursive(clean, methodName);
    return {
      bigO: this.bigO(loopDepth, recursive),
      cyclomatic: this.cyclomatic(clean, profile),
      loopDepth,
      recursive,
      loc: this.linesOfCode(code),
      scale: this.scale(loopDepth, recursive),
    };
  }

  // Blank out comments and string/template literals so their contents never count as
  // keywords, braces or calls.
  private stripNonCode(code: string): string {
    let stripped = "";
    let position = 0;
    while (position < code.length) {
      const char = code.charAt(position);
      const next = code.charAt(position + 1);
      if (char === "/" && next === "/") {
        position += 2;
        while (position < code.length && code.charAt(position) !== "\n") {
          position += 1;
        }
        continue;
      }
      if (char === "/" && next === "*") {
        position += 2;
        while (position < code.length && !(code.charAt(position) === "*" && code.charAt(position + 1) === "/")) {
          position += 1;
        }
        position += 2;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        position = this.skipString(code, position);
        stripped += '""';
        continue;
      }
      stripped += char;
      position += 1;
    }
    return stripped;
  }

  private skipString(code: string, start: number): number {
    const quote = code.charAt(start);
    let position = start + 1;
    while (position < code.length && code.charAt(position) !== quote) {
      position += this.charAt(code, position) === "\\" ? 2 : 1;
    }
    return position + 1;
  }

  private charAt(code: string, position: number): string {
    return code.charAt(position);
  }

  // Max nesting of loop scopes. A loop contributes one level whether its body is braced
  // (`for (…) { … }`) or brace-less (`for (…) stmt;`), and an array-iteration callback
  // (`.map(fn)`) counts as a loop over its `(…)`. A running counter tracks how many loop
  // scopes are open; we remember the deepest.
  //
  // Two scope kinds are tracked together:
  //  - bracket scopes: every `(`/`{` pushes a frame flagged whether it added a loop level
  //    (an iteration callback's `(`, or a braced loop body `{`). Closing it reverses that.
  //  - brace-less loop scopes: a loop header with no `{` body opens a level that lasts to
  //    the end of that single statement — the next `;` at the same bracket depth, or the
  //    `}` that ends a braced sub-statement (e.g. `for (…) if (c) { … }`).
  private loopDepth(clean: string, profile: ComplexityProfile): number {
    const brackets: { isLoop: boolean; isDoBody: boolean; header: boolean }[] = [];
    const bracelessLevels: number[] = [];
    let depth = 0;
    let maxDepth = 0;
    let pendingHeader = false; // saw for/while; its `(` is a loop header
    let pendingIter = false; // saw `.map`-style call; its `(` is a loop
    let pendingDoBody = false; // saw `do`; the body block is a loop body
    let expectBody = false; // a loop header just closed (or `do` seen): the body starts next
    let doConditionWhile = false; // the next `while` is a do-while condition, not a new loop
    let afterDot = false;
    let position = 0;

    const openBraceless = (): void => {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      bracelessLevels.push(brackets.length);
    };
    const closeBracelessTo = (level: number): void => {
      while (bracelessLevels.length > 0 && (bracelessLevels[bracelessLevels.length - 1] ?? -1) >= level) {
        bracelessLevels.pop();
        depth -= 1;
      }
    };

    while (position < clean.length) {
      const char = clean.charAt(position);
      if (this.isWhitespace(char)) {
        position += 1;
        continue;
      }
      // The body of a brace-less loop begins at the first non-space, non-`{` token after
      // its header; a `{` instead means a braced body, handled by the `{` branch below.
      if (expectBody && char !== "{") {
        openBraceless();
        expectBody = false;
      }

      if (this.isIdentifierStart(char)) {
        const end = this.identifierEnd(clean, position);
        const word = clean.slice(position, end);
        if (afterDot && profile.iterators.has(word)) {
          pendingIter = true;
        } else if (!afterDot && profile.headerLoops.has(word)) {
          if (word === "while" && doConditionWhile) {
            doConditionWhile = false; // a do-while condition: not a loop construct
          } else {
            pendingHeader = true;
          }
        } else if (!afterDot && word === "do") {
          pendingDoBody = true;
          expectBody = true;
        }
        afterDot = false;
        position = end;
        continue;
      }
      if (char === ".") {
        afterDot = true;
        position += 1;
        continue;
      }
      if (char === "(") {
        // A header keyword is never after a dot, so a `(` is at most one of header/iterator.
        const isHeader = pendingHeader;
        const isLoop = pendingIter && !isHeader;
        pendingIter = false;
        pendingHeader = false;
        brackets.push({ isLoop, isDoBody: false, header: isHeader });
        if (isLoop) {
          depth += 1;
          maxDepth = Math.max(maxDepth, depth);
        }
        afterDot = false;
        position += 1;
        continue;
      }
      if (char === "{") {
        const isLoop = expectBody;
        const isDoBody = pendingDoBody;
        expectBody = false;
        pendingDoBody = false;
        brackets.push({ isLoop, isDoBody, header: false });
        if (isLoop) {
          depth += 1;
          maxDepth = Math.max(maxDepth, depth);
        }
        afterDot = false;
        position += 1;
        continue;
      }
      if (char === ")") {
        const frame = brackets.pop();
        if (frame?.isLoop) {
          depth -= 1;
        }
        if (frame?.header) {
          expectBody = true; // header closed: the loop body starts next
        }
        afterDot = false;
        position += 1;
        continue;
      }
      if (char === "}") {
        const frame = brackets.pop();
        if (frame?.isLoop) {
          depth -= 1;
        }
        if (frame?.isDoBody) {
          doConditionWhile = true; // the `while (…)` that follows is the do-condition
        }
        closeBracelessTo(brackets.length); // a braced sub-statement ends the brace-less body
        afterDot = false;
        position += 1;
        continue;
      }
      if (char === ";") {
        closeBracelessTo(brackets.length);
        afterDot = false;
        position += 1;
        continue;
      }
      afterDot = false;
      position += 1;
    }
    return maxDepth;
  }

  // Exact: one decision point per branch keyword, boolean operator, ternary, and
  // iteration callback, plus the base path. Branch keywords and iterator method names come
  // from the language profile (e.g. C# adds `foreach` and LINQ operators).
  private cyclomatic(clean: string, profile: ComplexityProfile): number {
    const branchWords = [...profile.branchKeywords].map((word) => this.escape(word)).join("|");
    const iteratorNames = [...profile.iterators].map((name) => this.escape(name)).join("|");
    const branches = this.count(clean, new RegExp(`(?<![.\\w$])(?:${branchWords})(?![\\w$])`, "g"));
    const logical = this.count(clean, /&&|\|\|/g);
    const ternary = this.count(clean, /(?<!\?)\?(?!\s*[,):.?])/g);
    const iterators = this.count(clean, new RegExp(`\\.(?:${iteratorNames})\\s*\\(`, "g"));
    return 1 + branches + logical + ternary + iterators;
  }

  // The method calls *itself*. Two shapes count, and nothing else:
  //  - a self method-call on the receiver — `this.name(` / `this?.name(`;
  //  - a bare free-function call — `name(` not preceded by a `.` (member access) or word
  //    char. The declaration is itself one such bare occurrence, so genuine self-recursion
  //    needs at least two.
  // Critically, a call on *another* object that happens to share the name —
  // `this.otherService.name(` — is a member access on `otherService`, so it is NOT counted
  // (it's neither `this.name(` nor a bare call). That avoids the false positive where a
  // thin delegator like `pickup() { return this.pickupService.pickup(); }` looked recursive.
  // Needs a name; anonymous code is never recursive.
  private isRecursive(clean: string, methodName: string): boolean {
    if (!methodName) {
      return false;
    }
    const name = this.escape(methodName);
    const selfCalls = this.count(clean, new RegExp(`\\bthis\\s*\\??\\.\\s*${name}\\s*\\(`, "g"));
    if (selfCalls > 0) {
      return true;
    }
    const bareCalls = this.count(clean, new RegExp(`(?<![\\w$.])${name}\\s*\\(`, "g"));
    return bareCalls > 1;
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
    let position = start + 1;
    while (position < text.length && /[A-Za-z0-9_$]/.test(text.charAt(position))) {
      position += 1;
    }
    return position;
  }

  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  private escape(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
