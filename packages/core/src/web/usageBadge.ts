import type { TaskUsage } from "./types";
import { t } from "./i18n";

function compact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
}

function cost(usd: number): string {
  if (usd <= 0) {
    return "";
  }
  return usd < 0.01 ? `<$0.01` : `$${usd.toFixed(2)}`;
}

// Compact per-task token/cost chip: "↑1.2k ↓340 · $0.02 · 2×". Empty when a task
// has no recorded usage yet (no headless run has reported tokens).
export function usageBadge(usage: TaskUsage | null): string {
  if (!usage || usage.runs <= 0) {
    return "";
  }
  const parts = [`↑${compact(usage.inputTokens)}`, `↓${compact(usage.outputTokens)}`];
  const dollars = cost(usage.costUsd);
  if (dollars) {
    parts.push(dollars);
  }
  if (usage.cacheReadTokens > 0) {
    parts.push(`${t("usage.cached")} ${compact(usage.cacheReadTokens)}`);
  }
  const title = `${t("usage.title")}: ${usage.runs} ${t("usage.runs")}`;
  return `<span class="usage-chip" title="${title}">${parts.join(" · ")}</span>`;
}
