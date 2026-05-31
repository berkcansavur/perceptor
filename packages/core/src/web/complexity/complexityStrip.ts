import { t } from "../i18n";
import type { ComplexityReport, ComplexityScale } from "../types";

// The stated assumption behind any time figure: ~10^8 simple operations per second on
// one CPU core. So seconds = ops / 10^8 → secondsExponent = opsExponent − 8. This is the
// ONLY non-exact step (real hardware varies), and it is labeled as an assumption in the
// UI. Everything else (ops = n^depth) is exact integer-exponent arithmetic.
const OPS_PER_SECOND_EXPONENT = 8;

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

// The short metrics strip shown at the top of the Folder "explain" drawer and the
// Changes method detail: Big-O, cyclomatic, loop nesting, recursion, LOC — then (for
// super-linear methods) the exact operation projection and an explicitly-assumed,
// order-of-magnitude time band.
export function complexityStrip(report: ComplexityReport): string {
  const chips = [
    chip(prettyBigO(report.bigO), "cx-bigo"),
    chip(`${t("cx.cc")} ${report.cyclomatic}`, "cx-metric"),
    chip(`${t("cx.nesting")} ${report.loopDepth}`, "cx-metric"),
    report.recursive ? chip(t("cx.recursive"), "cx-warn") : "",
    chip(`${report.loc} ${t("cx.loc")}`, "cx-metric"),
  ]
    .filter((entry) => entry.length > 0)
    .join("");
  return `<div class="cx-strip">${chips}</div>${scaleLine(report.scale)}`;
}

function chip(text: string, kind: string): string {
  return `<span class="cx-chip ${kind}">${text}</span>`;
}

function scaleLine(scale: ComplexityScale[]): string {
  if (scale.length === 0) {
    return "";
  }
  const points = scale.map((point) => `n=${pow10(point.nExponent)}→${pow10(point.opsExponent)}`).join("  ·  ");
  const worst = scale[scale.length - 1];
  const band = worst ? ` ${durationBand(worst.opsExponent - OPS_PER_SECOND_EXPONENT)}` : "";
  return `<div class="cx-scale">${points} ${t("cx.ops")}<span class="cx-note">${t("cx.note")}${band}</span></div>`;
}

// Honest order-of-magnitude band from the (exact) seconds exponent. No fabricated exact
// number — just the scale, plus the "doesn't scale" warning once it runs into hours+.
function durationBand(secondsExponent: number): string {
  if (secondsExponent < 0) {
    return t("cx.bandInstant");
  }
  if (secondsExponent < 2) {
    return t("cx.bandSeconds");
  }
  if (secondsExponent < 4) {
    return t("cx.bandMinutes");
  }
  return t("cx.bandHeavy");
}

function prettyBigO(bigO: string): string {
  const match = /^O\(n\^(\d+)\)$/.exec(bigO);
  return match && match[1] ? `O(n${superscript(match[1])})` : bigO;
}

function pow10(exponent: number): string {
  return `10${superscript(String(exponent))}`;
}

function superscript(digits: string): string {
  return digits
    .split("")
    .map((digit) => SUPERSCRIPT[digit] ?? digit)
    .join("");
}
