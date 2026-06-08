import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CodingPreferencesStore,
  DEFAULT_CODING_PREFERENCES,
} from "../src/service/persistence/CodingPreferencesStore";

let root: string;
let store: CodingPreferencesStore;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rv-prefs-"));
  store = new CodingPreferencesStore(() => root);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("CodingPreferencesStore", () => {
  it("returns the house-style defaults when no file exists", () => {
    expect(store.read()).toEqual(DEFAULT_CODING_PREFERENCES);
  });

  it("round-trips a saved preference through the file", () => {
    store.save({ ...DEFAULT_CODING_PREFERENCES, primaryLanguage: "java" });

    expect(store.read().primaryLanguage).toBe("java");
    expect(fs.existsSync(path.join(root, ".perceptor", "coding-preferences.json"))).toBe(true);
  });

  it("merges a partial save over the defaults", () => {
    const saved = store.save({ naming: { classCase: "snake_case" } as never });

    expect(saved.naming.classCase).toBe("snake_case");
    expect(saved.naming.methodCase).toBe(DEFAULT_CODING_PREFERENCES.naming.methodCase);
    expect(saved.qualityGates).toEqual(DEFAULT_CODING_PREFERENCES.qualityGates);
  });

  it("fills missing sections with defaults when reading a stale file", () => {
    const file = path.join(root, ".perceptor", "coding-preferences.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ primaryLanguage: "csharp" }));

    const read = store.read();
    expect(read.primaryLanguage).toBe("csharp");
    expect(read.architecture).toEqual(DEFAULT_CODING_PREFERENCES.architecture);
  });

  it("falls back to defaults on malformed json", () => {
    const file = path.join(root, ".perceptor", "coding-preferences.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");

    expect(store.read()).toEqual(DEFAULT_CODING_PREFERENCES);
  });
});
