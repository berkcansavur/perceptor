import { AutoStatus } from "../types";
import { StreamUsage } from "./streamActivity";

// Abstracts spawning the headless task processor so the scheduler (AutoProcessor)
// can be unit-tested without launching a real Claude process.
export interface AutoProcessRun {
  readonly pid: number | null;
  // Fires exactly once when the run ends; `errorMessage` is null on clean exit.
  onExit(listener: (errorMessage: string | null) => void): void;
  // Fires repeatedly with a short label of what Claude is doing right now (its
  // streamed narration / tool calls), so the UI can show live progress.
  onActivity(listener: (text: string) => void): void;
  // Fires once when the run reports its final token/cost usage (the result event).
  onUsage(listener: (usage: StreamUsage) => void): void;
  // Terminates the run (and stops burning tokens). Exit fires as usual.
  kill(): void;
}

// Identifies the Claude session a run belongs to. `resume:false` means this is the
// task's first run and the id is created with --session-id; `resume:true` continues
// that same session with --resume so prior context (the diff/reasoning) is kept.
export type RunSession = {
  sessionId: string;
  resume: boolean;
};

export interface AutoProcessRunner {
  readonly available: boolean;
  readonly unavailableReason: AutoStatus["reason"];
  // `taskId` scopes the headless run to a single queued task; `session` ties the run
  // to that task's reusable Claude session so it resumes instead of cold-starting.
  run(rootDirectory: string, taskId: string, session: RunSession): AutoProcessRun;
}
