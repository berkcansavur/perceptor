import { describe, expect, it } from "vitest";
import { isIgnoredSegment, pathIsIgnored } from "../src/core";

// The walker and the file watcher must agree on what's irrelevant, or the watcher
// re-analyzes on build/IDE churn and loops the UI through endless refreshes.
describe("ignore policy", () => {
  it("ignores explicit build/dependency directories", () => {
    for (const segment of ["node_modules", "dist", "build", "out", "target", "bin", "obj"]) {
      expect(isIgnoredSegment(segment)).toBe(true);
    }
  });

  it("ignores any dot-directory or dotfile", () => {
    for (const segment of [".git", ".vscode", ".next", ".turbo", ".cache", ".DS_Store"]) {
      expect(isIgnoredSegment(segment)).toBe(true);
    }
  });

  it("does not ignore ordinary source segments", () => {
    for (const segment of ["src", "services", "User.ts", "Main.java"]) {
      expect(isIgnoredSegment(segment)).toBe(false);
    }
  });

  it("flags a path when any segment is ignored (cross-platform separators)", () => {
    expect(pathIsIgnored("packages/core/dist/cli.js")).toBe(true);
    expect(pathIsIgnored("web\\.next\\cache\\x")).toBe(true);
    expect(pathIsIgnored("src/service/repo/FileWatcher.ts")).toBe(false);
  });
});
