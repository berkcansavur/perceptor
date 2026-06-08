import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureGitignoreEntry,
  ensurePerceptorIgnored,
  migrateLegacyScratchDir,
} from "../src/core/ensurePerceptorIgnored";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rv-ignore-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function gitignore(): string {
  return fs.readFileSync(path.join(root, ".gitignore"), "utf-8");
}

describe("ensureGitignoreEntry", () => {
  it("does nothing when the root is not a git repo", () => {
    expect(ensureGitignoreEntry(root, ".perceptor/")).toBe(false);
    expect(fs.existsSync(path.join(root, ".gitignore"))).toBe(false);
  });

  it("appends the entry in a git repo", () => {
    fs.mkdirSync(path.join(root, ".git"));
    expect(ensureGitignoreEntry(root, ".perceptor/")).toBe(true);
    expect(gitignore()).toContain(".perceptor/");
  });

  it("is idempotent — no duplicate line on repeated calls", () => {
    fs.mkdirSync(path.join(root, ".git"));
    ensurePerceptorIgnored(root);
    ensurePerceptorIgnored(root);
    const lines = gitignore().split(/\r?\n/).filter((l) => l.trim() === ".perceptor/");
    expect(lines).toHaveLength(1);
  });

  it("treats a bare entry (no trailing slash) as already ignored", () => {
    fs.mkdirSync(path.join(root, ".git"));
    fs.writeFileSync(path.join(root, ".gitignore"), ".perceptor\n");
    ensurePerceptorIgnored(root);
    const occurrences = gitignore().split(/\r?\n/).filter((l) => l.trim().startsWith(".perceptor"));
    expect(occurrences).toHaveLength(1);
  });
});

describe("migrateLegacyScratchDir", () => {
  it("renames an existing .visualise dir to .perceptor", () => {
    fs.mkdirSync(path.join(root, ".visualise"));
    fs.writeFileSync(path.join(root, ".visualise", "graph.json"), "{}");

    migrateLegacyScratchDir(root);

    expect(fs.existsSync(path.join(root, ".visualise"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".perceptor", "graph.json"))).toBe(true);
  });

  it("does nothing when .perceptor already exists (no clobber)", () => {
    fs.mkdirSync(path.join(root, ".visualise"));
    fs.writeFileSync(path.join(root, ".visualise", "old.json"), "old");
    fs.mkdirSync(path.join(root, ".perceptor"));
    fs.writeFileSync(path.join(root, ".perceptor", "new.json"), "new");

    migrateLegacyScratchDir(root);

    expect(fs.existsSync(path.join(root, ".visualise"))).toBe(true);
    expect(fs.readFileSync(path.join(root, ".perceptor", "new.json"), "utf-8")).toBe("new");
  });

  it("is a no-op when there is no legacy dir", () => {
    expect(() => migrateLegacyScratchDir(root)).not.toThrow();
    expect(fs.existsSync(path.join(root, ".perceptor"))).toBe(false);
  });
});
