import { t } from "../i18n";
import type { ComplexityReport, ComplexityScale } from "../types";

// The stated assumption behind any time figure: ~10^8 simple operations per second on
// one CPU core. So seconds = ops / 10^8 → secondsExponent = opsExponent − 8. This is the
// ONLY non-exact step (real hardware varies), and it is labeled as an assumption in the
// UI. Everything else (ops = n^depth) is exact integer-exponent arithmetic.
const OPS_PER_SECOND_EXPONENT = 8;

type Risk = "low" | "moderate" | "risky" | "high";

const RISK_LABEL: Record<Risk, string> = {
  low: "cx.riskLow",
  moderate: "cx.riskModerate",
  risky: "cx.riskRisky",
  high: "cx.riskHigh",
};

// The method-complexity summary, written for a reader who scans rather than computes:
// a colour-coded risk badge + a one-line Big-O reading in plain language, then the raw
// numbers (each explained on hover), then — for super-linear methods — an honest,
// order-of-magnitude time band. No jargon abbreviations on the surface.
export function complexityStrip(report: ComplexityReport): string {
  const risk = riskLevel(report);
  const head =
    `<div class="cx-head">` +
    `<span class="cx-badge">${escape(t(RISK_LABEL[risk]))}</span>` +
    `<span class="cx-bigo">${bigOLabel(report)}</span>` +
    `</div>`;
  const explain = `<div class="cx-explain">${escape(explanation(report))}</div>`;
  const numbers = `<div class="cx-numbers">${numberChips(report)}</div>`;
  return `<div class="cx-strip cx-risk--${risk}">${head}${explain}${numbers}${projection(report.scale)}</div>`;
}

// Composite risk: the worse of the growth-rate band and the branchiness band, nudged up
// once for very long methods. Recursion is treated as high — its true cost is unknown and
// can be exponential. Thresholds are deliberately simple so the label stays explainable.
function riskLevel(report: ComplexityReport): Risk {
  const ladder: readonly Risk[] = ["low", "moderate", "risky", "high"];
  if (report.recursive) {
    return "high";
  }
  let score = Math.max(growthRank(report.bigO), cyclomaticRank(report.cyclomatic));
  if (report.loc > 80) {
    score = Math.min(3, score + 1);
  }
  return ladder[score] ?? "low";
}

// O(1)→0, O(n)→1, O(n²)→2, O(n³+)→3.
function growthRank(bigO: string): number {
  if (bigO === "O(1)") {
    return 0;
  }
  if (bigO === "O(n)") {
    return 1;
  }
  const power = /^O\(n\^(\d+)\)$/.exec(bigO);
  if (power && power[1]) {
    return Number(power[1]) >= 3 ? 3 : 2;
  }
  return 0;
}

function cyclomaticRank(cyclomatic: number): number {
  if (cyclomatic <= 5) {
    return 0;
  }
  if (cyclomatic <= 10) {
    return 1;
  }
  if (cyclomatic <= 20) {
    return 2;
  }
  return 3;
}

// "Scales quadratically (O(n²))" — the plain reading first, the notation in parentheses.
function bigOLabel(report: ComplexityReport): string {
  if (report.recursive) {
    return escape(t("cx.oRecursive"));
  }
  const key =
    report.bigO === "O(1)"
      ? "cx.oConstant"
      : report.bigO === "O(n)"
        ? "cx.oLinear"
        : growthRank(report.bigO) >= 3
          ? "cx.oCubic"
          : "cx.oQuadratic";
  return `${escape(t(key))} <span class="cx-bigo-notation">${escape(prettyBigO(report.bigO))}</span>`;
}

function explanation(report: ComplexityReport): string {
  if (report.recursive) {
    return t("cx.explainRecursive");
  }
  if (report.bigO === "O(1)") {
    return t("cx.explainConstant");
  }
  if (report.bigO === "O(n)") {
    return t("cx.explainLinear");
  }
  return growthRank(report.bigO) >= 3 ? t("cx.explainCubic") : t("cx.explainQuadratic");
}

// The raw numbers, each a labelled, hover-explained chip. The loop chip is dropped when
// there are no loops, and reads "nested loops" only when actually nested (depth ≥ 2).
function numberChips(report: ComplexityReport): string {
  const chips: string[] = [
    numberChip(report.cyclomatic, t("cx.paths"), t("cx.tipPaths")),
  ];
  if (report.loopDepth >= 1) {
    const label = report.loopDepth >= 2 ? t("cx.nestedLoops") : t("cx.loops");
    chips.push(numberChip(report.loopDepth, label, t("cx.tipLoops")));
  }
  chips.push(numberChip(report.loc, t("cx.lines"), t("cx.tipLines")));
  return chips.join('<span class="cx-sep">·</span>');
}

function numberChip(value: number, label: string, tip: string): string {
  return `<span class="cx-num" title="${escape(tip)}"><strong>${value}</strong> ${escape(label)}</span>`;
}

// Honest order-of-magnitude time at the largest sampled input. Only shown for methods
// whose cost actually grows with input (scale is non-empty for super-linear methods).
function projection(scale: ComplexityScale[]): string {
  const worst = scale[scale.length - 1];
  if (!worst) {
    return "";
  }
  const band = t(durationBandKey(worst.opsExponent - OPS_PER_SECOND_EXPONENT));
  const line = t("cx.proj", { n: humanCount(worst.nExponent), band });
  return `<div class="cx-proj">${escape(line)} <span class="cx-note">${escape(t("cx.note"))}</span></div>`;
}

function durationBandKey(secondsExponent: number): string {
  if (secondsExponent < 0) {
    return "cx.bandInstant";
  }
  if (secondsExponent < 2) {
    return "cx.bandSeconds";
  }
  if (secondsExponent < 4) {
    return "cx.bandMinutes";
  }
  return "cx.bandHeavy";
}

// 10^3 → "1K", 10^6 → "1M", 10^9 → "1B"; anything else falls back to 10^exponent.
function humanCount(exponent: number): string {
  const units: Record<number, string> = { 3: "1K", 6: "1M", 9: "1B", 12: "1T" };
  return units[exponent] ?? `10${superscript(String(exponent))}`;
}

function prettyBigO(bigO: string): string {
  const match = /^O\(n\^(\d+)\)$/.exec(bigO);
  return match && match[1] ? `O(n${superscript(match[1])})` : bigO;
}

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

function superscript(digits: string): string {
  return digits
    .split("")
    .map((digit) => SUPERSCRIPT[digit] ?? digit)
    .join("");
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
