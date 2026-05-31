import { ChildProcess, spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { AutoProcessRun, AutoProcessRunner, RunSession } from "./AutoProcessRunner";
import { activityFromStreamLine, usageFromStreamLine, StreamUsage } from "./streamActivity";
import { AutoStatus } from "../types";

export const AUTO_PROCESS_LOG = ".visualise/auto-process.log";

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

class SpawnedRun implements AutoProcessRun {
  private exitListener: ((errorMessage: string | null) => void) | null = null;
  private activityListener: ((text: string) => void) | null = null;
  private usageListener: ((usage: StreamUsage) => void) | null = null;
  private fired = false;
  private buffer = "";

  constructor(
    private readonly child: ChildProcess,
    private readonly logPath: string
  ) {
    this.pipe(child.stdout, true);
    this.pipe(child.stderr, false);
    child.on("exit", (code) => this.fire(code ? `Auto-process exited with code ${code}.` : null));
    child.on("error", (error) => this.fire(`Auto-process failed: ${error.message}`));
  }

  get pid(): number | null {
    return this.child.pid ?? null;
  }

  onExit(listener: (errorMessage: string | null) => void): void {
    this.exitListener = listener;
  }

  onActivity(listener: (text: string) => void): void {
    this.activityListener = listener;
  }

  onUsage(listener: (usage: StreamUsage) => void): void {
    this.usageListener = listener;
  }

  // Stop the run immediately. SIGTERM first; a SIGKILL fallback if Claude ignores
  // it. The child's `exit` event drives the usual cleanup.
  kill(): void {
    if (this.fired) {
      return;
    }
    try {
      this.child.kill("SIGTERM");
    } catch {
      // already gone
    }
    setTimeout(() => {
      if (!this.fired) {
        try {
          this.child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }
    }, 2000).unref();
  }

  private fire(errorMessage: string | null): void {
    if (this.fired) {
      return;
    }
    this.fired = true;
    this.exitListener?.(errorMessage);
  }

  // Tee every chunk to the raw log; parse stdout's JSONL into live activity labels.
  private pipe(stream: NodeJS.ReadableStream | null, parse: boolean): void {
    if (!stream) {
      return;
    }
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      fs.appendFileSync(this.logPath, chunk);
      if (parse) {
        this.consume(chunk);
      }
    });
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      const activity = activityFromStreamLine(line);
      if (activity && this.activityListener) {
        this.activityListener(activity);
      }
      const usage = usageFromStreamLine(line);
      if (usage && this.usageListener) {
        this.usageListener(usage);
      }
      newline = this.buffer.indexOf("\n");
    }
  }
}

// Real runner: spawns `claude -p "/visualise tasks <root>"`. Unavailable inside
// Docker or when the Claude CLI is missing.
export class ClaudeProcessRunner implements AutoProcessRunner {
  private readonly command: string | null;
  readonly available: boolean;
  readonly unavailableReason: AutoStatus["reason"];

  constructor() {
    this.command = detectClaudeCommand();
    const docker = isInDocker();
    this.available = !docker && this.command !== null;
    this.unavailableReason = docker ? "docker" : this.command ? null : "claude-cli-missing";
  }

  run(rootDirectory: string, taskId: string, session: RunSession): AutoProcessRun {
    if (!this.command) {
      throw new Error("claude command not available");
    }
    const logPath = path.join(rootDirectory, AUTO_PROCESS_LOG);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const prompt = `/visualise tasks ${rootDirectory} --task ${taskId}`;
    const sessionArg = session.resume ? ["--resume", session.sessionId] : ["--session-id", session.sessionId];
    fs.appendFileSync(
      logPath,
      `\n=== ${prompt} [${session.resume ? "resume" : "new"} ${session.sessionId}] @ ${new Date().toISOString()} ===\n`
    );
    const child = spawn(
      this.command,
      [...sessionArg, "-p", prompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"],
      { cwd: rootDirectory, stdio: ["ignore", "pipe", "pipe"] }
    );
    return new SpawnedRun(child, logPath);
  }
}
