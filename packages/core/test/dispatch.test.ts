import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCoreService } from "../src/service";

let root: string;
let core: ReturnType<typeof createCoreService>;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rv-dispatch-"));
  core = createCoreService(root, null);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("CoreService.dispatch — envelope + global exception funnel", () => {
  it("wraps a handler's payload in a SuccessResponse with a trace id", async () => {
    const response = await core.dispatch("tasks", {});

    expect(response.success).toBe(true);
    if (response.success) {
      expect(response.data).toEqual({ tasks: [] });
    }
    expect(typeof response.traceId).toBe("string");
    expect(response.traceId.length).toBeGreaterThan(0);
    expect(typeof response.timestamp).toBe("string");
  });

  it("maps an unknown action to an UNKNOWN_ACTION ErrorResponse", async () => {
    const response = await core.dispatch("doesNotExist", {});

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.code).toBe("UNKNOWN_ACTION");
      expect(response.error.details).toEqual({ action: "doesNotExist" });
    }
  });

  it("maps a domain exception to its ErrorResponse code", async () => {
    const response = await core.dispatch("updateTask", { id: "missing", status: "approved" });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.code).toBe("TASK_NOT_FOUND");
      expect(response.error.details).toEqual({ taskId: "missing" });
    }
  });

  it("reports an unsupported capability when no host wired it", async () => {
    const response = await core.dispatch("openFile", { file: "src/x.ts", line: 1 });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.code).toBe("UNSUPPORTED");
    }
  });
});
