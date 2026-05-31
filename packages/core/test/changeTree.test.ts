import { describe, expect, it } from "vitest";
import { buildChangeTree } from "../src/web/changes/changeTree";
import type { Task } from "../src/web/types";

function task(partial: Partial<Task>): Task {
  return {
    id: "t",
    type: "add-behavior",
    status: "proposed",
    from: null,
    to: null,
    spec: null,
    diff: null,
    ...partial,
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
    expect(file?.methods).toEqual([{ label: "page()", status: "add", taskId: "a1" }]);
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
      status: "edit",
      taskId: "e1",
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
});
