import { qsa } from "../dom";
import { t } from "../i18n";
import type { FlowReport, FlowStep } from "../types";
import type { FlowPlayer } from "./FlowPlayer";
import { collectRefs, evalCondition, type Env, type Val } from "./conditionEval";

// The interactive payload simulator that sits above the run-flow storyboard. It surfaces
// every signature parameter the method receives as an editable field, plus the nested paths
// and call-result stubs (what each `const x = svc.foo()` returned) that the branches hinge
// on. On "Run" it lights up only the path that payload takes — dimming the arms it skips —
// then animates that path. Everything is evaluated by the safe `conditionEval` (never
// `eval`), and anything it can't decide leaves both arms shown.
//
// One instance is reused across method panels; `attach` rebuilds it against each freshly
// rendered strip. It renders nothing only when a method has no parameters and no stubs.
export class FlowSimulator {
  private root: HTMLElement | null = null;
  private player: FlowPlayer | null = null;
  private panel: HTMLElement | null = null;
  // Every distinct value the branches hinge on. Kept so the Raw-JSON tab can resolve a payload
  // object against the same set of refs the Fields tab exposes.
  private inputRefs: string[] = [];
  private stubRefs: string[] = [];
  private activeTab: "fields" | "json" = "fields";

  attach(root: HTMLElement, flow: FlowReport, player: FlowPlayer): void {
    this.teardown();
    this.root = root;
    this.player = player;

    const params = this.inputParams(flow);
    const branchRefs = this.distinctRefs(this.collectConditions(flow.steps));
    // Every signature parameter is editable. When a branch drills into a param (e.g.
    // `req.isRestricted`), surface that exact path so the guard is steerable and drop the bare
    // param (the condition never reads it whole); params no branch touches stay bare fields.
    const nested = branchRefs.filter((ref) => ref.includes(".") && params.includes(this.rootOf(ref)));
    const nestedRoots = new Set(nested.map((ref) => this.rootOf(ref)));
    const bareParams = params.filter((param) => !nestedRoots.has(param));
    this.inputRefs = [...bareParams, ...nested];
    this.stubRefs = branchRefs.filter((ref) => !params.includes(this.rootOf(ref)));
    if (this.inputRefs.length === 0 && this.stubRefs.length === 0) {
      return; // no parameters and no call-result stubs — nothing to enter
    }

    this.activeTab = "fields";
    this.panel = this.buildPanel(this.inputRefs, this.stubRefs);
    const head = root.querySelector(".fx-head");
    head?.insertAdjacentElement("afterend", this.panel);
    this.bind();
  }

  // Drop the panel and any simulation styling from the previous method.
  private teardown(): void {
    this.panel?.remove();
    this.panel = null;
  }

  // ── Run / Clear ──────────────────────────────────────────────────────────────────────

  private run(): void {
    if (!this.root || !this.player || !this.panel) {
      return;
    }
    const env = this.activeTab === "json" ? this.readJsonEnv() : this.readFieldEnv();
    if (env === null) {
      return; // invalid JSON — the error is already shown, don't simulate
    }
    const verdict = this.evaluateBranches(env);
    this.applyVerdicts(verdict);
    this.root.classList.add("fx-simulated");
    this.player.resync(); // re-scope playback to the surviving (taken) rows
    this.player.start();
  }

  private clear(): void {
    if (!this.root || !this.player) {
      return;
    }
    for (const row of qsa<HTMLElement>(this.root, ".fx-step")) {
      row.classList.remove("fx-skip", "fx-taken", "fx-untaken");
      const line = row.querySelector<HTMLElement>(".fx-line");
      line?.removeAttribute("data-fx-verdict");
    }
    this.root.classList.remove("fx-simulated");
    this.player.resync();
  }

  // Evaluate every branch's condition against the payload, keyed by the branch id the strip
  // stamped on each `if` row.
  private evaluateBranches(env: Env): Record<string, string> {
    const verdict: Record<string, string> = {};
    if (!this.root) {
      return verdict;
    }
    for (const branch of qsa<HTMLElement>(this.root, "[data-fx-branch]")) {
      const id = branch.dataset.fxBranch ?? "";
      const condition = branch.dataset.fxCond ?? "";
      verdict[id] = evalCondition(condition, env);
    }
    return verdict;
  }

  // Translate verdicts into row styling: a row is skipped when any branch arm it sits inside
  // went the other way; the `if` row itself is marked taken/skipped; the `else` divider is
  // skipped when its branch went true (so the false arm is unused).
  private applyVerdicts(verdict: Record<string, string>): void {
    if (!this.root) {
      return;
    }
    for (const row of qsa<HTMLElement>(this.root, ".fx-step")) {
      const ancestors = row.dataset.fxAnc ?? "";
      let skip = this.isSkipped(ancestors, verdict);

      const elseId = row.dataset.fxElse;
      if (elseId && verdict[elseId] === "true") {
        skip = true;
      }
      row.classList.toggle("fx-skip", skip);

      row.classList.remove("fx-taken", "fx-untaken");
      const line = row.querySelector<HTMLElement>(".fx-line");
      line?.removeAttribute("data-fx-verdict");

      const selfId = row.dataset.fxBranch;
      if (selfId && !skip) {
        const value = verdict[selfId];
        if (value === "true") {
          row.classList.add("fx-taken");
          line?.setAttribute("data-fx-verdict", t("fx.taken"));
        } else if (value === "false") {
          row.classList.add("fx-untaken");
          line?.setAttribute("data-fx-verdict", t("fx.skipped"));
        } else {
          line?.setAttribute("data-fx-verdict", t("fx.unknownPath"));
        }
      }
    }
  }

  // A row belongs to a dead path when any ancestor branch decided the opposite arm. Unknown
  // ancestor verdicts don't skip — both arms stay visible, honestly.
  private isSkipped(ancestors: string, verdict: Record<string, string>): boolean {
    if (!ancestors) {
      return false;
    }
    for (const part of ancestors.split("|")) {
      const [id, arm] = part.split(":");
      const value = verdict[id ?? ""];
      if (value === "true" && arm === "f") {
        return true;
      }
      if (value === "false" && arm === "t") {
        return true;
      }
    }
    return false;
  }

  // ── Payload form ───────────────────────────────────────────────────────────────────────

  private readFieldEnv(): Env {
    const env: Env = {};
    if (!this.panel) {
      return env;
    }
    for (const field of qsa<HTMLInputElement>(this.panel, "[data-fx-field]")) {
      env[field.dataset.fxField ?? ""] = this.parseLiteral(field.value);
    }
    for (const stub of qsa<HTMLSelectElement>(this.panel, "[data-fx-stub]")) {
      const ref = stub.dataset.fxStub ?? "";
      // "value" lets the user type a concrete result so the path is actually testable; an empty
      // box still means "some non-null value". null/true/false ignore the box.
      if (stub.value === "present") {
        const raw = this.stubValueInput(ref)?.value.trim() ?? "";
        env[ref] = raw === "" ? { t: "present" } : this.parseLiteral(raw);
      } else {
        env[ref] = this.stubValue(stub.value);
      }
    }
    return env;
  }

  // Parse the Raw-JSON textarea into an env by resolving each branch ref against the payload
  // object. Returns null (and surfaces a message) when the text isn't valid JSON or isn't a
  // plain object — so junk can't silently "run". Refs that the object doesn't cover are simply
  // left unresolved (the branch stays "both paths").
  private readJsonEnv(): Env | null {
    const area = this.panel?.querySelector<HTMLTextAreaElement>("[data-fx-json]");
    const raw = area?.value.trim() ?? "";
    if (raw === "") {
      return this.jsonError(t("fx.jsonEmpty"));
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.jsonError(t("fx.jsonInvalid"));
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return this.jsonError(t("fx.jsonNotObject"));
    }
    this.jsonError(null); // clear any stale error
    const env: Env = {};
    const payload = parsed as Record<string, unknown>;
    for (const ref of [...this.inputRefs, ...this.stubRefs]) {
      // A flat key matching the whole ref wins; otherwise resolve the dotted path nested.
      const found = Object.prototype.hasOwnProperty.call(payload, ref)
        ? { ok: true as const, value: payload[ref] }
        : this.resolvePath(payload, ref);
      if (found.ok) {
        env[ref] = this.toVal(found.value);
      }
    }
    return env;
  }

  // Show (text) or clear (null) the JSON validation message. Always returns null so callers can
  // `return this.jsonError(msg)` to abort a run.
  private jsonError(message: string | null): null {
    const box = this.panel?.querySelector<HTMLElement>("[data-fx-json-error]");
    if (box) {
      box.textContent = message ?? "";
      box.classList.toggle("hidden", message === null);
    }
    return null;
  }

  // Resolve a dotted ref (`req.isRestricted`, `stops.length`) against the parsed payload.
  // `.length`/`.size` on an array or string yields its count, so a guard like `stops.length > 2`
  // can be steered by giving `stops` an array.
  private resolvePath(payload: Record<string, unknown>, ref: string): { ok: true; value: unknown } | { ok: false } {
    let current: unknown = payload;
    for (const segment of ref.split(".")) {
      if ((segment === "length" || segment === "size") && (Array.isArray(current) || typeof current === "string")) {
        return { ok: true, value: current.length };
      }
      if (typeof current !== "object" || current === null || !(segment in (current as Record<string, unknown>))) {
        return { ok: false };
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return { ok: true, value: current };
  }

  // Map a raw JSON value onto the evaluator's value model. Objects/arrays become "present"
  // (truthy, contents opaque) — enough to decide null-checks and truthiness.
  private toVal(value: unknown): Val {
    if (value === null || value === undefined) {
      return { t: "null" };
    }
    if (typeof value === "number") {
      return { t: "num", v: value };
    }
    if (typeof value === "string") {
      return { t: "str", v: value };
    }
    if (typeof value === "boolean") {
      return { t: "bool", v: value };
    }
    return { t: "present" };
  }

  // A starter payload for the Raw-JSON tab: every field the Fields tab exposes (params and
  // call-result stubs alike) nested back into an object, seeded with the same friendly defaults
  // — so the two tabs always share the same keys. `stops.length` becomes a `stops` array of that
  // many items so the count-based guards are immediately steerable.
  private defaultJson(refs: string[]): string {
    const root: Record<string, unknown> = {};
    for (const ref of refs) {
      const segments = ref.split(".");
      const last = segments[segments.length - 1] ?? ref;
      if ((last === "length" || last === "size") && segments.length > 1) {
        this.assignPath(root, segments.slice(0, -1), this.sampleArray(this.defaultText(ref)));
      } else {
        this.assignPath(root, segments, this.literalOf(this.defaultText(ref)));
      }
    }
    return JSON.stringify(root, null, 2);
  }

  private assignPath(root: Record<string, unknown>, segments: string[], value: unknown): void {
    let current = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i] ?? "";
      if (typeof current[key] !== "object" || current[key] === null || Array.isArray(current[key])) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    current[segments[segments.length - 1] ?? ""] = value;
  }

  private sampleArray(text: string): unknown[] {
    const n = Number(text);
    const length = Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 2;
    return Array.from({ length }, (_, i) => i + 1);
  }

  // Turn the Fields tab's default *text* into a real JSON literal for the scaffold.
  private literalOf(text: string): unknown {
    if (text === "true" || text === "false") {
      return text === "true";
    }
    if (/^-?\d+(\.\d+)?$/.test(text)) {
      return Number(text);
    }
    return text;
  }

  // Parse a free-text field into a typed value: a bare number, true/false, null/empty, or
  // (stripping any quotes) a string.
  private parseLiteral(raw: string): Val {
    const text = raw.trim();
    if (text === "" || text === "null" || text === "undefined") {
      return { t: "null" };
    }
    if (text === "true" || text === "false") {
      return { t: "bool", v: text === "true" };
    }
    if (/^-?\d+(\.\d+)?$/.test(text)) {
      return { t: "num", v: Number(text) };
    }
    const unquoted = /^(["'`])(.*)\1$/.exec(text);
    return { t: "str", v: unquoted ? (unquoted[2] ?? "") : text };
  }

  private stubValue(choice: string): Val {
    if (choice === "null") {
      return { t: "null" };
    }
    if (choice === "true" || choice === "false") {
      return { t: "bool", v: choice === "true" };
    }
    return { t: "present" }; // "value": some non-null value, exact contents unknown
  }

  private buildPanel(inputRefs: string[], stubRefs: string[]): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "fx-sim";
    panel.innerHTML =
      this.tabsMarkup() +
      `<div class="fx-sim-pane" data-fx-pane="fields">${this.fieldsMarkup(inputRefs, stubRefs)}</div>` +
      `<div class="fx-sim-pane hidden" data-fx-pane="json">${this.jsonMarkup(inputRefs, stubRefs)}</div>` +
      `<div class="fx-sim-actions">` +
      `<button type="button" class="fx-play" data-fx-run>${this.escape(t("fx.run"))}</button>` +
      `<button type="button" class="fx-btn" data-fx-clear>${this.escape(t("fx.clear"))}</button>` +
      `</div>`;
    return panel;
  }

  // The Fields ⇄ Raw JSON switch. Only the active tab's pane is shown; Run reads from whichever
  // is active, so the two input styles never apply at once.
  private tabsMarkup(): string {
    const tab = (id: "fields" | "json", label: string): string =>
      `<button type="button" class="fx-tab${this.activeTab === id ? " fx-tab--active" : ""}" data-fx-tab="${id}">${this.escape(label)}</button>`;
    return `<div class="fx-sim-tabs">${tab("fields", t("fx.tabFields"))}${tab("json", t("fx.tabJson"))}</div>`;
  }

  private fieldsMarkup(inputRefs: string[], stubRefs: string[]): string {
    const inputs = inputRefs
      .map(
        (ref) =>
          `<label class="fx-field"><span class="fx-field-name">${this.escape(ref)}</span>` +
          `<input type="text" class="fx-field-input" data-fx-field="${this.escape(ref)}" value="${this.escape(this.defaultText(ref))}" /></label>`
      )
      .join("");
    const stubs = stubRefs
      .map(
        (ref) =>
          `<label class="fx-field"><span class="fx-field-name">${this.escape(ref)}</span>` +
          `<span class="fx-stub-row">` +
          `<select class="fx-field-input fx-stub-kind" data-fx-stub="${this.escape(ref)}">` +
          `<option value="present">${this.escape(t("fx.stubValue"))}</option>` +
          `<option value="null">${this.escape(t("fx.stubNull"))}</option>` +
          `<option value="true">true</option><option value="false">false</option>` +
          `</select>` +
          `<input type="text" class="fx-field-input fx-stub-value" data-fx-stub-value="${this.escape(ref)}" ` +
          `placeholder="${this.escape(t("fx.stubValuePlaceholder"))}" value="" /></span></label>`
      )
      .join("");
    return (
      `<div class="fx-sim-hint">${this.escape(t("fx.payloadHint"))}</div>` +
      (inputs ? `<div class="fx-sim-grid">${inputs}</div>` : "") +
      (stubs
        ? `<div class="fx-sim-sub">${this.escape(t("fx.stubs"))}</div><div class="fx-sim-grid">${stubs}</div>`
        : "")
    );
  }

  private jsonMarkup(inputRefs: string[], stubRefs: string[]): string {
    return (
      `<div class="fx-sim-hint">${this.escape(t("fx.jsonHint"))}</div>` +
      `<textarea class="fx-json" data-fx-json spellcheck="false" rows="6">${this.escape(this.defaultJson([...inputRefs, ...stubRefs]))}</textarea>` +
      `<div class="fx-sim-error hidden" data-fx-json-error></div>`
    );
  }

  private bind(): void {
    this.panel?.querySelector("[data-fx-run]")?.addEventListener("click", () => this.run());
    this.panel?.querySelector("[data-fx-clear]")?.addEventListener("click", () => this.clear());
    for (const tab of qsa<HTMLElement>(this.panel!, "[data-fx-tab]")) {
      tab.addEventListener("click", () => this.selectTab((tab.dataset.fxTab as "fields" | "json") ?? "fields"));
    }
    // Only the "value" choice carries a free-text box; the rest (null/true/false) hide it.
    for (const select of qsa<HTMLSelectElement>(this.panel!, "[data-fx-stub]")) {
      select.addEventListener("change", () => this.syncStubValue(select));
      this.syncStubValue(select);
    }
  }

  // Show the stub's free-text box only while "value" is selected.
  private syncStubValue(select: HTMLSelectElement): void {
    const input = this.stubValueInput(select.dataset.fxStub ?? "");
    input?.classList.toggle("hidden", select.value !== "present");
  }

  private stubValueInput(ref: string): HTMLInputElement | null {
    return this.panel?.querySelector<HTMLInputElement>(`[data-fx-stub-value="${ref}"]`) ?? null;
  }

  // Flip the active tab: highlight its button and show only its pane.
  private selectTab(tab: "fields" | "json"): void {
    if (!this.panel) {
      return;
    }
    this.activeTab = tab;
    for (const button of qsa<HTMLElement>(this.panel, "[data-fx-tab]")) {
      button.classList.toggle("fx-tab--active", button.dataset.fxTab === tab);
    }
    for (const pane of qsa<HTMLElement>(this.panel, "[data-fx-pane]")) {
      pane.classList.toggle("hidden", pane.dataset.fxPane !== tab);
    }
  }

  // A friendly editable default for an input field, guessed from the reference's last segment
  // (so `req.isRestricted` starts `true`, `stops.length` starts `2`, `count` starts `42`).
  private defaultText(ref: string): string {
    const leaf = (ref.split(".").pop() ?? ref).toLowerCase();
    if (ref.endsWith(".length") || ref.endsWith(".size")) {
      return "2";
    }
    if (/^(is|has|can|should|are|was|allow)/.test(leaf) || /(enabled|disabled|restricted|active|valid|visible)$/.test(leaf)) {
      return "true";
    }
    if (leaf === "id" || /id$/.test(leaf) || /(count|qty|amount|price|total|fare|fee|sum|index|limit|offset|size|length|num|number)/.test(leaf)) {
      return "42";
    }
    if (/(status|type|state|kind|mode)/.test(leaf)) {
      return "open";
    }
    return "sample";
  }

  // ── Flow introspection ───────────────────────────────────────────────────────────────

  private inputParams(flow: FlowReport): string[] {
    const input = flow.steps.find((step) => step.kind === "input");
    return input && input.kind === "input" ? input.params : [];
  }

  private collectConditions(steps: FlowStep[]): string[] {
    const out: string[] = [];
    for (const step of steps) {
      if (step.kind === "branch") {
        out.push(step.condition);
        out.push(...this.collectConditions(step.whenTrue));
        out.push(...this.collectConditions(step.whenFalse));
      }
    }
    return out;
  }

  private distinctRefs(conditions: string[]): string[] {
    const seen: string[] = [];
    for (const condition of conditions) {
      for (const ref of collectRefs(condition)) {
        if (!seen.includes(ref)) {
          seen.push(ref);
        }
      }
    }
    return seen;
  }

  private rootOf(ref: string): string {
    return ref.split(".")[0] ?? ref;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
