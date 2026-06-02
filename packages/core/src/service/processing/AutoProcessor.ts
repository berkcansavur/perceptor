import { randomUUID } from "crypto";
import { AutoActivity, AutoStatus, Task } from "../types";
import { TaskStore } from "../task/TaskStore";
import { ResultStore } from "../task/ResultStore";
import { BehaviorSummaryStore } from "../persistence/BehaviorSummaryStore";
import { AutoEnableStore } from "../persistence/AutoEnableStore";
import { AutoProcessRun, AutoProcessRunner, RunSession } from "./AutoProcessRunner";
import { StreamUsage } from "./streamActivity";
import { footprintsOverlap, taskFootprint } from "../task/taskFootprint";
import { AUTO_PROCESS_LOG, ClaudeProcessRunner } from "./ClaudeProcessRunner";

// Watchdog only — the primary trigger is event-driven (notify). This long tick
// reaps locks left by a crashed run and catches externally-edited queues.
const WATCHDOG_INTERVAL_MS = 45000;
// Coalesce a burst of enqueues/updates into a single tick.
const DEBOUNCE_MS = 150;
// How many headless runs may be in flight at once. Independent tasks (e.g. several
// chat requests) run in parallel; conflicting ones are deferred by the footprint gate.
const MAX_CONCURRENCY = 3;
const ACTIONABLE_STATUSES: ReadonlySet<string> = new Set(["pending", "approved"]);
// Statuses that mean Claude finished its turn — never overwrite these with an error.
const CLAUDE_ADVANCED_STATUSES: ReadonlySet<string> = new Set(["proposed", "applied", "rejected"]);
// One headless run per status — if Claude finishes without advancing the task we
// don't re-trigger it (that would burn tokens); the user sees it in the banner.
const MAX_AUTO_ATTEMPTS = 1;

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

type ActiveRun = {
  run: AutoProcessRun;
  footprint: ReadonlySet<string>;
  session: RunSession;
}

// Token-conservative, host-only task runner. Default OFF. Event-driven: a task being
// enqueued/approved, or a run finishing, triggers `notify()`. Up to MAX_CONCURRENCY
// runs proceed in parallel; the footprint gate keeps two runs off the same files so
// they never conflict (and we never burn tokens on a run that would lose the race).
export class AutoProcessor {
  private enabled = false;
  private watchdog: NodeJS.Timeout | null = null;
  private pendingTick: NodeJS.Timeout | null = null;
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly activities = new Map<string, AutoActivity>();
  private readonly stopRequestedIds = new Set<string>();
  private readonly results: ResultStore;
  private readonly summaries: BehaviorSummaryStore;
  private readonly enabledStore: AutoEnableStore;
  private stoppedMessage = "Stopped.";

  constructor(
    private readonly getRoot: () => string,
    private readonly store: TaskStore,
    private readonly runner: AutoProcessRunner = new ClaudeProcessRunner()
  ) {
    this.results = new ResultStore(getRoot);
    this.summaries = new BehaviorSummaryStore(getRoot);
    this.enabledStore = new AutoEnableStore(getRoot);
  }

  // Re-adopt the persisted opt-in on startup (the editor reloaded / the panel reopened),
  // so a user who enabled auto-processing earlier stays enabled instead of silently
  // reverting to OFF. No-op when it was never enabled for this repo.
  restore(): void {
    if (this.enabledStore.read() && this.runner.available && !this.enabled) {
      this.enabled = true;
      this.startWatchdog();
      this.notify();
    }
  }

  status(): AutoStatus {
    return {
      available: this.runner.available,
      enabled: this.enabled,
      running: this.activeRuns.size > 0,
      reason: this.runner.unavailableReason,
    };
  }

  // Live labels of what Claude is doing on each in-flight task (empty when idle).
  currentActivities(): AutoActivity[] {
    return [...this.activities.values()];
  }

  // User-initiated interrupt to stop burning tokens. With a `taskId`, kill only that
  // task's run (the others keep going); without one, kill every in-flight run. A
  // killed task is gated so it won't auto-restart until the user replies.
  stop(stoppedMessage: string, taskId: string | null): AutoStatus {
    this.stoppedMessage = stoppedMessage;
    const targets = taskId ? [taskId] : [...this.activeRuns.keys()];
    for (const id of targets) {
      const active = this.activeRuns.get(id);
      if (active) {
        this.stopRequestedIds.add(id);
        active.run.kill();
      }
    }
    return this.status();
  }

  setEnabled(next: boolean): AutoStatus {
    if (!this.runner.available) {
      return this.status();
    }
    this.enabled = next;
    this.enabledStore.save(next); // survive a reload — the opt-in is the whole point
    if (this.enabled) {
      this.startWatchdog();
      this.notify();
    } else {
      this.stopTimers();
    }
    return this.status();
  }

  // Primary trigger. Called when the queue changes (enqueue/update) and when a
  // run finishes (drain). Debounced and idempotent while a tick is pending.
  notify(): void {
    if (!this.enabled || !this.runner.available || this.pendingTick) {
      return;
    }
    this.pendingTick = setTimeout(() => {
      this.pendingTick = null;
      this.tick();
    }, DEBOUNCE_MS);
    this.pendingTick.unref();
  }

  private startWatchdog(): void {
    if (this.watchdog) {
      return;
    }
    this.watchdog = setInterval(() => this.tick(), WATCHDOG_INTERVAL_MS);
    this.watchdog.unref();
  }

  private stopTimers(): void {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    if (this.pendingTick) {
      clearTimeout(this.pendingTick);
      this.pendingTick = null;
    }
  }

  private tick(): void {
    if (!this.enabled || !this.runner.available) {
      return;
    }
    this.reapStaleLocks(this.store.read());
    this.fillCapacity();
  }

  // Claim every eligible task until the pool is full or none remain. Re-reads the
  // queue after each claim so the next pick sees the lock/footprint just taken.
  private fillCapacity(): void {
    while (this.activeRuns.size < MAX_CONCURRENCY) {
      const candidate = this.nextEligible(this.store.read());
      if (!candidate) {
        return;
      }
      this.claimAndRun(candidate);
    }
  }

  // Reap locks left by a dead process (e.g. the editor window reloaded mid-run). Our
  // own in-flight locks (tracked in activeRuns) and live foreign locks are left alone.
  private reapStaleLocks(tasks: readonly Task[]): void {
    for (const task of tasks) {
      if (!task.lock || this.activeRuns.has(task.id) || isProcessAlive(task.lock.pid)) {
        continue;
      }
      this.clearLock(
        task.id,
        "Auto-process was interrupted before finishing (the editor window may have reloaded). Reply to retry."
      );
    }
  }

  private nextEligible(tasks: readonly Task[]): Task | undefined {
    const claimed = this.unionActiveFootprints();
    return tasks.find(
      (task) =>
        !this.activeRuns.has(task.id) &&
        !this.hasForeignLock(task) &&
        this.isActionable(task) &&
        !footprintsOverlap(taskFootprint(task), claimed)
    );
  }

  private hasForeignLock(task: Task): boolean {
    return Boolean(task.lock && isProcessAlive(task.lock.pid));
  }

  private unionActiveFootprints(): Set<string> {
    return new Set([...this.activeRuns.values()].flatMap((active) => [...active.footprint]));
  }

  // A task to spawn Claude for: a fresh pending/approved one, or ANY task whose last
  // message is a user reply it hasn't answered yet — including an already-applied one.
  // Replying to an applied change continues the SAME session (its sessionId is kept on a
  // plain reply), so Claude has the prior context and the follow-up costs fewer tokens.
  // One attempt per state — TaskStore clears `auto` on a user message, re-opening the gate.
  private isActionable(task: Task): boolean {
    if (task.dismissed) {
      return false;
    }
    if (task.auto && task.auto.status === task.status && task.auto.attempts >= MAX_AUTO_ATTEMPTS) {
      return false;
    }
    if (ACTIONABLE_STATUSES.has(task.status)) {
      return true;
    }
    const lastMessage = task.messages[task.messages.length - 1];
    return Boolean(lastMessage && lastMessage.role === "user");
  }

  private claimAndRun(task: Task): void {
    const session = this.sessionFor(task);
    const footprint = taskFootprint(task);
    this.results.clear(task.id);
    this.store.mutate(task.id, (item) => {
      const sameStatus = item.auto && item.auto.status === item.status;
      item.auto = { status: item.status, attempts: sameStatus && item.auto ? item.auto.attempts + 1 : 1 };
      item.lock = { pid: null, startedAt: new Date().toISOString() };
      item.sessionId = session.sessionId;
    });

    const run = this.runner.run(this.getRoot(), task.id, session);
    this.activeRuns.set(task.id, { run, footprint, session });
    this.store.mutate(task.id, (item) => {
      item.lock = { pid: run.pid, startedAt: new Date().toISOString() };
    });

    run.onActivity((text) => {
      this.activities.set(task.id, { taskId: task.id, text, at: new Date().toISOString() });
    });
    run.onUsage((usage) => this.recordUsage(task.id, usage));
    run.onExit((errorMessage) => this.onRunExit(task.id, errorMessage));
  }

  private onRunExit(taskId: string, errorMessage: string | null): void {
    this.activeRuns.delete(taskId);
    this.activities.delete(taskId);
    const stopped = this.stopRequestedIds.delete(taskId);
    const runResult = this.results.take(taskId);
    if (runResult) {
      this.store.mergeResult(taskId, runResult);
      if (runResult.kind === "described") {
        const { file, behavior, text } = runResult.summary;
        this.summaries.write(file, behavior, text);
      }
    }
    // A run that failed without producing a result means its session was never usefully
    // established: a resumed one is gone, or a brand-new one died before Claude created
    // it (e.g. the binary couldn't be spawned). Either way drop the id so the next
    // attempt cold-starts instead of resuming a session that doesn't exist — the task
    // still carries its diff.
    if (errorMessage && !runResult) {
      this.store.mutate(taskId, (item) => {
        item.sessionId = null;
      });
    }
    this.clearLock(taskId, errorMessage, stopped);
    // A manual stop must NOT re-trigger (that would burn tokens again); the gate set
    // in clearLock keeps it parked until the user replies.
    if (!stopped) {
      this.notify();
    }
  }

  // Reuse the task's existing session (resume) or mint one for its first run.
  private sessionFor(task: Task): RunSession {
    if (task.sessionId) {
      return { sessionId: task.sessionId, resume: true };
    }
    return { sessionId: randomUUID(), resume: false };
  }

  // Accumulate this run's tokens/cost onto the task so the UI shows the running
  // total a task has cost across its propose/apply/chat runs.
  private recordUsage(id: string, usage: StreamUsage): void {
    this.store.mutate(id, (task) => {
      const prior = task.usage;
      task.usage = {
        inputTokens: (prior?.inputTokens ?? 0) + usage.inputTokens,
        outputTokens: (prior?.outputTokens ?? 0) + usage.outputTokens,
        cacheReadTokens: (prior?.cacheReadTokens ?? 0) + usage.cacheReadTokens,
        cacheCreationTokens: (prior?.cacheCreationTokens ?? 0) + usage.cacheCreationTokens,
        costUsd: (prior?.costUsd ?? 0) + usage.costUsd,
        runs: (prior?.runs ?? 0) + 1,
        at: new Date().toISOString(),
      };
    });
  }

  private clearLock(id: string, errorMessage: string | null, stopped = false): void {
    this.store.mutate(id, (task) => {
      task.lock = null;
      if (stopped) {
        task.auto = { status: task.status, attempts: MAX_AUTO_ATTEMPTS };
        task.messages.push({ role: "claude", text: this.stoppedMessage, at: new Date().toISOString() });
        return;
      }
      if (errorMessage && !CLAUDE_ADVANCED_STATUSES.has(task.status)) {
        task.status = "error";
        task.messages.push({
          role: "claude",
          text: `${errorMessage} (see ${AUTO_PROCESS_LOG})`,
          at: new Date().toISOString(),
        });
      }
    });
  }
}
