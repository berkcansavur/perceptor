import { type QueryProfile, queryProfileForFile } from "./queryProfiles";
import type { QueryFinding, QueryReport, QueryRiskKind, QuerySeverity } from "../service/types";

// Static, deterministic data-access risk for one method. It reads source text only — never
// runs a query and never reports a time. What it CAN see, defensibly, are anti-patterns:
//  - N+1: a database call sitting inside a loop (we're handed the method's loop depth).
//  - Raw-SQL smells inside string literals: SELECT *, missing WHERE, write without WHERE,
//    leading-wildcard LIKE, 3+ JOINs.
//  - ORM smells in code: unbounded findAll()/findMany(), 3+ chained eager loads.
// The UI presents these as risk signals (a badge + a plain-language list), mirroring the
// complexity strip — not as latency. Language-specific call names come from a QueryProfile.
export class QueryAnalyzer {
  private static readonly SEVERITY_RANK: Record<QuerySeverity, number> = { moderate: 1, high: 2 };

  analyze(code: string, filePath: string | undefined, loopDepth: number): QueryReport {
    const profile = queryProfileForFile(filePath);
    const found = new Map<QueryRiskKind, QueryFinding>();
    const add = (kind: QueryRiskKind, severity: QuerySeverity): void => {
      const existing = found.get(kind);
      if (!existing || QueryAnalyzer.SEVERITY_RANK[severity] > QueryAnalyzer.SEVERITY_RANK[existing.severity]) {
        found.set(kind, { kind, severity });
      }
    };

    for (const literal of this.stringLiterals(code)) {
      this.scanSql(literal, add);
    }
    this.scanCalls(this.stripStringsAndComments(code), profile, loopDepth, add);

    const findings = [...found.values()];
    return { risk: this.risk(findings), findings };
  }

  // ── Raw-SQL smells (from a single string/template literal's contents) ──────────────────
  private scanSql(sql: string, add: (kind: QueryRiskKind, severity: QuerySeverity) => void): void {
    // Only treat a literal as SQL if it actually reads like a statement — avoids matching
    // ordinary prose that happens to contain the word "from" or "like".
    if (!/\b(?:select|insert|update|delete|merge)\b/i.test(sql) || !/\b(?:from|into|set|join|where|values)\b/i.test(sql)) {
      return;
    }
    if (/\bselect\s+\*/i.test(sql)) {
      add("selectStar", "moderate");
    }
    const isWrite = (/\bupdate\b/i.test(sql) && /\bset\b/i.test(sql)) || /\bdelete\s+from\b/i.test(sql);
    if (isWrite && !/\bwhere\b/i.test(sql)) {
      add("writeNoWhere", "high");
    }
    const isUnboundedRead =
      /\bselect\b/i.test(sql) &&
      /\bfrom\b/i.test(sql) &&
      !/\bwhere\b/i.test(sql) &&
      !/\blimit\b/i.test(sql) &&
      !/\btop\b/i.test(sql) &&
      !/\bcount\s*\(/i.test(sql); // COUNT(*) FROM … is a legitimate whole-table aggregate
    if (isUnboundedRead) {
      add("noWhere", "moderate");
    }
    if (/\blike\s+['"`]?\s*%/i.test(sql)) {
      add("leadingWildcard", "moderate");
    }
    if ((sql.match(/\bjoin\b/gi) ?? []).length >= 3) {
      add("manyJoins", "moderate");
    }
  }

  // ── ORM/code smells (from the comment- and string-stripped source) ─────────────────────
  private scanCalls(
    code: string,
    profile: QueryProfile,
    loopDepth: number,
    add: (kind: QueryRiskKind, severity: QuerySeverity) => void
  ): void {
    // N+1: any unambiguous DB call when the method also contains a loop. We use the method's
    // loop depth (computed by the ComplexityAnalyzer) rather than re-deriving scopes here.
    if (loopDepth >= 1 && this.matches(code, this.callPattern(profile.queryCalls)) > 0) {
      add("nPlusOne", "high");
    }
    // Unbounded fetch: findAll()/findMany() with empty parentheses (no filter argument).
    if (this.matches(code, this.emptyCallPattern(profile.unboundedFinders)) > 0) {
      add("unboundedFind", "moderate");
    }
    // Over-fetch: 3+ chained eager loaders (Include().ThenInclude()…, leftJoinAndSelect…).
    if (this.matches(code, this.callPattern(profile.eagerLoaders)) >= 3) {
      add("eagerInclude", "moderate");
    }
  }

  // Worst-of severity, with two-or-more moderates promoted to "risky" — matches the
  // complexity strip's bands so the UI shares one colour vocabulary.
  private risk(findings: QueryFinding[]): QueryReport["risk"] {
    if (findings.some((finding) => finding.severity === "high")) {
      return "high";
    }
    const moderates = findings.filter((finding) => finding.severity === "moderate").length;
    if (moderates >= 2) {
      return "risky";
    }
    return moderates === 1 ? "moderate" : "low";
  }

  private callPattern(names: ReadonlySet<string>): RegExp | null {
    if (names.size === 0) {
      return null;
    }
    const alternation = [...names].map((name) => this.escape(name)).join("|");
    return new RegExp(`\\b(?:${alternation})\\s*\\(`, "g");
  }

  private emptyCallPattern(names: ReadonlySet<string>): RegExp | null {
    if (names.size === 0) {
      return null;
    }
    const alternation = [...names].map((name) => this.escape(name)).join("|");
    return new RegExp(`\\b(?:${alternation})\\s*\\(\\s*\\)`, "g");
  }

  private matches(text: string, pattern: RegExp | null): number {
    return pattern ? (text.match(pattern) ?? []).length : 0;
  }

  // Collect the contents of every string/template literal (raw SQL lives here).
  private stringLiterals(code: string): string[] {
    const literals: string[] = [];
    let position = 0;
    while (position < code.length) {
      const char = code.charAt(position);
      const next = code.charAt(position + 1);
      if (char === "/" && next === "/") {
        position = this.skipLineComment(code, position);
        continue;
      }
      if (char === "/" && next === "*") {
        position = this.skipBlockComment(code, position);
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        const end = this.skipString(code, position);
        literals.push(code.slice(position + 1, Math.max(position + 1, end - 1)));
        position = end;
        continue;
      }
      position += 1;
    }
    return literals;
  }

  // Blank out comments and string contents (replaced by empty quotes) so call detection
  // never trips on text inside a literal or comment.
  private stripStringsAndComments(code: string): string {
    let stripped = "";
    let position = 0;
    while (position < code.length) {
      const char = code.charAt(position);
      const next = code.charAt(position + 1);
      if (char === "/" && next === "/") {
        position = this.skipLineComment(code, position);
        continue;
      }
      if (char === "/" && next === "*") {
        position = this.skipBlockComment(code, position);
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

  private skipLineComment(code: string, start: number): number {
    let position = start + 2;
    while (position < code.length && code.charAt(position) !== "\n") {
      position += 1;
    }
    return position;
  }

  private skipBlockComment(code: string, start: number): number {
    let position = start + 2;
    while (position < code.length && !(code.charAt(position) === "*" && code.charAt(position + 1) === "/")) {
      position += 1;
    }
    return position + 2;
  }

  private skipString(code: string, start: number): number {
    const quote = code.charAt(start);
    let position = start + 1;
    while (position < code.length && code.charAt(position) !== quote) {
      position += code.charAt(position) === "\\" ? 2 : 1;
    }
    return position + 1;
  }

  private escape(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
