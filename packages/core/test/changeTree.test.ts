import { describe, expect, it } from "vitest";
import { buildChangeTree } from "../src/web/changes/changeTree";
import type { Task } from "../src/web/types";

function task(partial: Partial<Task> & { diff?: string | null }): Task {
  const { diff, ...rest } = partial;
  return {
    id: "t",
    type: "add-behavior",
    status: "proposed",
    from: null,
    to: null,
    spec: null,
    artifact: diff ? { kind: "proposed", diff, impact: { risk: "low", notes: [] } } : { kind: "none" },
    ...rest,
  } as Task;
}

describe("buildChangeTree", () => {
  it("nests an added method under its folder and file", () => {
    const tree = buildChangeTree([
      task({
        id: "a1",
        type: "add-behavior",
        from: { class: "OrderService", file: "src/services/OrderService.ts" } as never,
        spec: { name: "page" } as never,
      }),
    ]);
    const file = tree.folders.get("src")?.folders.get("services")?.files.get("OrderService.ts");
    expect(file?.methods).toEqual([{ label: "page()", name: "page", status: "add", taskId: "a1", code: "", oldCode: "" }]);
  });

  it("marks an edited method with edit status", () => {
    const tree = buildChangeTree([
      task({
        id: "e1",
        type: "edit-behavior",
        from: { class: "Svc", file: "src/Svc.ts", behavior: "filter" } as never,
      }),
    ]);
    expect(tree.folders.get("src")?.files.get("Svc.ts")?.methods[0]).toEqual({
      label: "filter()",
      name: "filter",
      status: "edit",
      taskId: "e1",
      code: "",
      oldCode: "",
    });
  });

  it("splits a move into an out leaf and an in leaf", () => {
    const tree = buildChangeTree([
      task({
        id: "m1",
        type: "move-behavior",
        from: { class: "A", file: "src/A.ts", behavior: "calc" } as never,
        to: { class: "B", file: "src/B.ts" } as never,
      }),
    ]);
    expect(tree.folders.get("src")?.files.get("A.ts")?.methods[0]?.status).toBe("out");
    expect(tree.folders.get("src")?.files.get("B.ts")?.methods[0]?.status).toBe("in");
  });

  it("records request diffs at file level with line counts", () => {
    const diff =
      "diff --git a/src/Order.ts b/src/Order.ts\n--- a/src/Order.ts\n+++ b/src/Order.ts\n@@ -1,2 +1,3 @@\n x\n+y\n+z";
    const tree = buildChangeTree([task({ id: "r1", type: "request", diff })]);
    const file = tree.folders.get("src")?.files.get("Order.ts");
    expect(file?.status).toBe("edit");
    expect(file?.added).toBe(2);
    expect(file?.taskId).toBe("r1");
  });

  it("flags a created file as add and slices an added method's body for metrics", () => {
    const diff = [
      "--- /dev/null",
      "+++ b/src/Repo.ts",
      "@@ -0,0 +1,5 @@",
      "+export class Repo {",
      "+  total(items) {",
      "+    return items.reduce((sum, x) => sum + x, 0);",
      "+  }",
      "+}",
    ].join("\n");
    const tree = buildChangeTree([task({ id: "r2", type: "request", diff })]);
    const file = tree.folders.get("src")?.files.get("Repo.ts");
    expect(file?.status).toBe("add");
    const method = file?.methods.find((entry) => entry.name === "total");
    expect(method?.status).toBe("add");
    expect(method?.code).toContain("reduce");
    expect(method?.oldCode).toBe("");
  });

  it("slices both the old and new body of an edited method", () => {
    const diff = [
      "--- a/src/Sum.ts",
      "+++ b/src/Sum.ts",
      "@@ -1,5 +1,5 @@",
      " export class Sum {",
      "-  total(items) {",
      "-    return items.length;",
      "-  }",
      "+  total(items) {",
      "+    return items.reduce((sum, x) => sum + x, 0);",
      "+  }",
      " }",
    ].join("\n");
    const tree = buildChangeTree([task({ id: "r3", type: "request", diff })]);
    const method = tree.folders.get("src")?.files.get("Sum.ts")?.methods.find((entry) => entry.name === "total");
    expect(method?.status).toBe("edit");
    expect(method?.oldCode).toContain("items.length");
    expect(method?.code).toContain("reduce");
  });

  it("detects a body-only edit whose signature line is unchanged context", () => {
    const diff = [
      "--- a/src/Svc.ts",
      "+++ b/src/Svc.ts",
      "@@ -1,5 +1,5 @@",
      " export class Svc {",
      "   total(items) {",
      "-    return items.length;",
      "+    return items.reduce((sum, x) => sum + x, 0);",
      "   }",
      " }",
    ].join("\n");
    const tree = buildChangeTree([task({ id: "r4", type: "request", diff })]);
    const method = tree.folders.get("src")?.files.get("Svc.ts")?.methods.find((entry) => entry.name === "total");
    expect(method?.status).toBe("edit");
    expect(method?.oldCode).toContain("items.length");
    expect(method?.code).toContain("reduce");
  });

  it("does not list a method whose body sits unchanged in the diff context", () => {
    const diff = [
      "--- a/src/Svc.ts",
      "+++ b/src/Svc.ts",
      "@@ -1,6 +1,7 @@",
      " export class Svc {",
      "   untouched() {",
      "     return 1;",
      "   }",
      "+  added() {",
      "+    return 2;",
      "+  }",
      " }",
    ].join("\n");
    const tree = buildChangeTree([task({ id: "r5", type: "request", diff })]);
    const methods = tree.folders.get("src")?.files.get("Svc.ts")?.methods ?? [];
    expect(methods.map((entry) => entry.name)).toEqual(["added"]);
  });
});
