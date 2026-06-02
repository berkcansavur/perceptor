import { t } from "../i18n";
import type { QueryReport, QueryRiskKind } from "../types";

// The data-access risk strip: a colour-coded badge (reusing the complexity strip's risk
// bands and `cx-risk--*` colours) plus a plain-language list of the detected query/ORM
// anti-patterns. These are STATIC risk signals, never timings. Renders nothing when no
// finding fired, so a clean method shows no strip at all.

const RISK_LABEL: Record<QueryReport["risk"], string> = {
  low: "cx.riskLow",
  moderate: "cx.riskModerate",
  risky: "cx.riskRisky",
  high: "cx.riskHigh",
};

// Each finding kind maps to a plain-language explanation key (defined in i18n EN + TR).
const FINDING_LABEL: Record<QueryRiskKind, string> = {
  nPlusOne: "qx.nPlusOne",
  selectStar: "qx.selectStar",
  noWhere: "qx.noWhere",
  writeNoWhere: "qx.writeNoWhere",
  leadingWildcard: "qx.leadingWildcard",
  manyJoins: "qx.manyJoins",
  unboundedFind: "qx.unboundedFind",
  eagerInclude: "qx.eagerInclude",
};

export function queryStrip(query: QueryReport): string {
  if (query.findings.length === 0) {
    return "";
  }
  const head =
    `<div class="qx-head">` +
    `<span class="cx-badge">${escape(t(RISK_LABEL[query.risk]))}</span>` +
    `<span class="qx-title">${escape(t("qx.heading"))}</span>` +
    `</div>`;
  const items = query.findings
    .map(
      (finding) =>
        `<li class="qx-finding qx-sev--${finding.severity}">${escape(t(FINDING_LABEL[finding.kind]))}</li>`
    )
    .join("");
  return `<div class="qx-strip cx-risk--${query.risk}">${head}<ul class="qx-findings">${items}</ul></div>`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
