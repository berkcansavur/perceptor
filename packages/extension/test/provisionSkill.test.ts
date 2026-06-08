import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copySkill } from "../src/provisionSkill";

// The skill provisioner is the reliability linchpin: it must install the /perceptor skill
// onto a fresh machine, propagate upgrades, stay a no-op once current, and never throw.
describe("copySkill", () => {
  let tmp: string;
  let source: string;
  let dest: string;
  let logs: string[];

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-prov-"));
    source = path.join(tmp, "bundled", "SKILL.md");
    dest = path.join(tmp, "home", ".claude", "skills", "perceptor", "SKILL.md");
    fs.mkdirSync(path.dirname(source), { recursive: true });
    logs = [];
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("installs the skill on a fresh machine, creating parent dirs", () => {
    fs.writeFileSync(source, "v1");
    copySkill(source, dest, (m) => logs.push(m));
    expect(fs.readFileSync(dest, "utf8")).toBe("v1");
    expect(logs.some((m) => m.includes("provisioned"))).toBe(true);
  });

  it("overwrites an outdated installed copy (upgrade)", () => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, "old");
    fs.writeFileSync(source, "new");
    copySkill(source, dest, (m) => logs.push(m));
    expect(fs.readFileSync(dest, "utf8")).toBe("new");
  });

  it("is a no-op when the installed copy already matches", () => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(source, "same");
    fs.writeFileSync(dest, "same");
    copySkill(source, dest, (m) => logs.push(m));
    expect(logs).toEqual([]);
  });

  it("does not throw when the bundled skill is missing", () => {
    expect(() => copySkill(source, dest, (m) => logs.push(m))).not.toThrow();
    expect(fs.existsSync(dest)).toBe(false);
    expect(logs.some((m) => m.includes("skipped"))).toBe(true);
  });
});
