import { ChildProcess, spawn, spawnSync } from "child_process";
import * as fs from "fs";
import { AutoStatus, Task } from "./types";
import { TaskStore } from "./taskStore";

const POLL_INTERVAL_MS = 5000;
const ACTIONABLE_STATUSES: ReadonlySet<string> = new Set(["pending", "approved"]);
// One headless run per status — if Claude finishes without advancing the task we
// don't re-trigger it (that would burn tokens); the user sees it in the banner.
const MAX_AUTO_ATTEMPTS = 1;

function isInDocker(): boolean {
  if (fs.existsSync("/.dockerenv")) {
    return true;
  }
  return Boolean(process.env["CONTAINER_WORKSPACE"]);
}

function detectClaudeCommand(): string | null {
  const override = process.env["VISUALISE_CLAUDE_BIN"];
  if (override) {
    return override;
  }
  const probe = spawnSync("claude", ["--version"], { stdio: "ignore" });
  return probe.error ? null : "claude";
}

function isProcessAlive(pid: number | null): boolean {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Token-conservative, host-only task runner. Default OFF. While a task holds a
// live lock no new Claude is spawned, so at most one headless run happens at a
// time and idle ticks cost nothing.
export class AutoProcessor {
  private readonly claudeCommand: string | null;
  private readonly available: boolean;
  private enabled = false;
  private timer: NodeJS.Timeout | null = null;
  private activeChild: ChildProcess | null = null;

  constructor(
    private readonly getRoot: () => string,
    private readonly store: TaskStore
  ) {
    this.claudeCommand = detectClaudeCommand();
    this.available = !isInDocker() && this.claudeCommand !== null;
  }

  status(): AutoStatus {
    return {
      available: this.available,
      enabled: this.enabled,
      running: this.activeChild !== null,
      reason: isInDocker() ? "docker" : this.claudeCommand ? null : "claude-cli-missing",
    };
  }

  setEnabled(next: boolean): AutoStatus {
    if (!this.available) {
      return this.status();
    }
    this.enabled = next;
    if (this.enabled && !this.timer) {
      this.timer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
      this.timer.unref();
    }
    return this.status();
  }

  private clearLock(id: string, errorMessage: string | null): void {
    this.store.mutate(id, (task) => {
      delete task.lock;
      if (errorMessage && ACTIONABLE_STATUSES.has(task.status)) {
        task.status = "error";
        task.messages.push({ role: "claude", text: errorMessage, at: new Date().toISOString() });
      }
    });
  }

  private spawnClaude(task: Task): void {
    const rootDirectory = this.getRoot();
    const command = this.claudeCommand;
    if (!command) {
      return;
    }
    const child = spawn(
      command,
      ["-p", `/visualise tasks ${rootDirectory}`, "--dangerously-skip-permissions"],
      { cwd: rootDirectory, stdio: "ignore" }
    );
    this.activeChild = child;
    this.store.mutate(task.id, (item) => {
      item.lock = { pid: child.pid ?? null, startedAt: new Date().toISOString() };
    });
    child.on("exit", (code) => {
      this.activeChild = null;
      this.clearLock(task.id, code ? `Auto-process exited with code ${code}.` : null);
    });
    child.on("error", (error) => {
      this.activeChild = null;
      this.clearLock(task.id, `Auto-process failed: ${error.message}`);
    });
  }

  private tick(): void {
    if (!this.enabled || !this.available) {
      return;
    }
    const tasks = this.store.read();

    const locked = tasks.find((task) => task.lock);
    if (locked && locked.lock) {
      if (isProcessAlive(locked.lock.pid) || this.activeChild) {
        return; // guard: don't re-trigger
      }
      this.clearLock(locked.id, "Auto-process died before finishing.");
      return;
    }

    const candidate = tasks.find(
      (task) =>
        ACTIONABLE_STATUSES.has(task.status) &&
        !task.dismissed &&
        !(task.auto && task.auto.status === task.status && task.auto.attempts >= MAX_AUTO_ATTEMPTS)
    );
    if (!candidate) {
      return;
    }

    this.store.mutate(candidate.id, (task) => {
      const sameStatus = task.auto && task.auto.status === task.status;
      task.auto = { status: task.status, attempts: sameStatus && task.auto ? task.auto.attempts + 1 : 1 };
      task.lock = { pid: null, startedAt: new Date().toISOString() };
    });
    this.spawnClaude(candidate);
  }
}
