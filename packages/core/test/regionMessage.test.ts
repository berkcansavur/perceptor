import { describe, expect, it } from "vitest";
import { regionMessage } from "../src/web/changes/regionMessage";

describe("regionMessage", () => {
  it("tags the text with its diff region", () => {
    expect(regionMessage("src/Order.ts @@ -1,4 +1,5 @@", "rename this to currencyCode")).toBe(
      "[src/Order.ts @@ -1,4 +1,5 @@] rename this to currencyCode"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(regionMessage("  src/A.ts  ", "  do X  ")).toBe("[src/A.ts] do X");
  });
});
