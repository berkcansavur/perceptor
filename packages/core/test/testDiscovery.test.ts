import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestDiscovery } from "../src/core/TestDiscovery";

let root: string;
let discovery: TestDiscovery;

function write(relPath: string, content: string): void {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rv-testdisc-"));
  discovery = new TestDiscovery();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const SOURCE = "src/modules/basket/BasketService.ts";

describe("TestDiscovery.findTestedMethods — title-based coverage", () => {
  it("marks a method tested only when a describe/it title names it", () => {
    write("src/modules/basket/BasketService.test.ts", `
      describe("BasketService.removeItem", () => {
        it("removes the item", () => {});
      });
    `);
    const covered = discovery.findTestedMethods("src/modules/basket/BasketService.test.ts", root, ["removeItem", "createBasket"]);
    expect(covered.has("removeItem")).toBe(true);
    expect(covered.has("createBasket")).toBe(false);
  });

  it("does NOT count a mocked dependency method as tested (no false positive)", () => {
    // findById appears only as a mock + helper call, never in a title.
    write("src/modules/basket/BasketService.test.ts", `
      const repo = { findById: jest.fn() };
      describe("BasketService.removeItem", () => {
        it("works", async () => {
          repo.findById.mockResolvedValue(basket);
          basket.addItem("p", 1);
        });
      });
    `);
    const covered = discovery.findTestedMethods(
      "src/modules/basket/BasketService.test.ts", root, ["removeItem", "findById", "addItem"]
    );
    expect([...covered]).toEqual(["removeItem"]);
  });

  it("uses word boundaries — addItem does not match addItems", () => {
    write("src/modules/basket/BasketService.test.ts", `describe("BasketService.addItems", () => { it("x", () => {}); });`);
    const covered = discovery.findTestedMethods("src/modules/basket/BasketService.test.ts", root, ["addItem", "addItems"]);
    expect(covered.has("addItems")).toBe(true);
    expect(covered.has("addItem")).toBe(false);
  });

  it("handles a method name containing a regex metachar ($) safely", () => {
    write("src/x.test.ts", `describe("uses $value", () => { it("x", () => {}); });`);
    const covered = discovery.findTestedMethods("src/x.test.ts", root, ["$value"]);
    expect(covered.has("$value")).toBe(true);
  });
});

describe("TestDiscovery.findAllTestsForClass — multi-file", () => {
  it("discovers both a beside-source test and a perceptor-tests/ test", () => {
    write("package.json", `{ "devDependencies": { "jest": "^29" } }`);
    write("src/modules/basket/BasketService.test.ts", `describe("BasketService.removeItem", () => { it("x", () => {}); });`);
    write("perceptor-tests/src/modules/basket/BasketService.test.ts", `describe("BasketService.createBasket", () => { it("x", () => {}); });`);

    const all = discovery.findAllTestsForClass(SOURCE, root).map((t) => t.testFile);
    expect(all).toContain("src/modules/basket/BasketService.test.ts");
    expect(all).toContain(path.join("perceptor-tests", "src/modules/basket/BasketService.test.ts"));
  });

  it("discovers per-method split test files (BasketService.addItem.test.ts)", () => {
    write("package.json", `{ "devDependencies": { "jest": "^29" } }`);
    write("perceptor-tests/src/modules/basket/BasketService.addItem.test.ts", `describe("BasketService.addItem", () => { it("x", () => {}); });`);

    const all = discovery.findAllTestsForClass(SOURCE, root).map((t) => t.testFile);
    expect(all).toContain(path.join("perceptor-tests", "src/modules/basket/BasketService.addItem.test.ts"));
    expect(discovery.findTestCovering(SOURCE, root, "addItem")?.testFile)
      .toBe(path.join("perceptor-tests", "src/modules/basket/BasketService.addItem.test.ts"));
  });

  it("does not match an unrelated class's test (BasketServiceHelper.test.ts)", () => {
    write("src/modules/basket/BasketServiceHelper.test.ts", `describe("BasketServiceHelper", () => { it("x", () => {}); });`);
    const all = discovery.findAllTestsForClass(SOURCE, root).map((t) => t.testFile);
    expect(all).not.toContain("src/modules/basket/BasketServiceHelper.test.ts");
  });
});

describe("TestDiscovery.findTestCovering — picks the file that covers the method", () => {
  beforeEach(() => {
    write("package.json", `{ "devDependencies": { "jest": "^29" } }`);
    write("src/modules/basket/BasketService.test.ts", `describe("BasketService.removeItem", () => { it("x", () => {}); });`);
    write("perceptor-tests/src/modules/basket/BasketService.test.ts", `describe("BasketService.createBasket", () => { it("x", () => {}); });`);
  });

  it("returns the beside-source file for removeItem", () => {
    expect(discovery.findTestCovering(SOURCE, root, "removeItem")?.testFile)
      .toBe("src/modules/basket/BasketService.test.ts");
  });

  it("returns the perceptor-tests file for createBasket (not shadowed by the first file)", () => {
    expect(discovery.findTestCovering(SOURCE, root, "createBasket")?.testFile)
      .toBe(path.join("perceptor-tests", "src/modules/basket/BasketService.test.ts"));
  });

  it("returns null for a method no test covers", () => {
    expect(discovery.findTestCovering(SOURCE, root, "findById")).toBeNull();
  });
});
