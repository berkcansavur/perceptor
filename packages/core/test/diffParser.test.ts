import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/web/changes/diffParser";

const DIFF = `diff --git a/src/Order.ts b/src/Order.ts
index 1111111..2222222 100644
--- a/src/Order.ts
+++ b/src/Order.ts
@@ -1,4 +1,5 @@
 export class Order {
-  private total = 0;
+  private total = 0;
+  private currency = "EUR";
   id = "";
 }
diff --git a/src/New.ts b/src/New.ts
new file mode 100644
--- /dev/null
+++ b/src/New.ts
@@ -0,0 +1,2 @@
+export const ANSWER = 42;
+export type Answer = typeof ANSWER;`;

describe("parseUnifiedDiff", () => {
  it("splits a multi-file diff into files with clean paths", () => {
    const files = parseUnifiedDiff(DIFF);
    expect(files.map((file) => file.path)).toEqual(["src/Order.ts", "src/New.ts"]);
  });

  it("counts added and removed lines per file", () => {
    const [order, created] = parseUnifiedDiff(DIFF);
    expect(order?.added).toBe(2);
    expect(order?.removed).toBe(1);
    expect(created?.added).toBe(2);
    expect(created?.removed).toBe(0);
  });

  it("classifies lines and strips the leading marker", () => {
    const [order] = parseUnifiedDiff(DIFF);
    const lines = order?.hunks[0]?.lines ?? [];
    expect(lines[0]).toEqual({ kind: "context", text: "export class Order {" });
    expect(lines[1]).toEqual({ kind: "del", text: "  private total = 0;" });
    expect(lines[3]).toEqual({ kind: "add", text: '  private currency = "EUR";' });
  });

  it("keeps the hunk header verbatim", () => {
    const [order] = parseUnifiedDiff(DIFF);
    expect(order?.hunks[0]?.header).toBe("@@ -1,4 +1,5 @@");
  });

  it("returns an empty list for an empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});
