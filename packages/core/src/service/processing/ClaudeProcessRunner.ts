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

// A GUI-launched VS Code (Dock/Finder) inherits launchd's minimal PATH, which omits
// Homebrew/nvm/asdf/etc — so the extension host can't see `claude` even though the
// user's terminal can. Instead of hard-coding install locations, we ask the user's own
// login shell, exactly once: it yields both the binary's absolute path (`command -v`)
// and the real PATH to hand the child, so the tool adapts to whatever environment the
// user actually has. Cached because launching a login shell isn't free.
type ShellResolution = { command: string | null; path: string | null };
const PATH_MARKER = "__VISUALISE_PATH__";
let shellResolution: ShellResolution | undefined;

function resolveViaLoginShell(): ShellResolution {
  if (shellResolution) {
    return shellResolution;
  }
  const shell = process.env["SHELL"];
  if (!shell) {
    return (shellResolution = { command: null, path: null });
  }
  try {
    const probe = spawnSync(shell, ["-lic", `command -v claude; echo ${PATH_MARKER}$PATH`], { encoding: "utf8" });
    const stdout = probe.stdout || "";
    const pathLine = new RegExp(`${PATH_MARKER}(.*)`).exec(stdout);
    const command = stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith(PATH_MARKER) && path.isAbsolute(line) && fs.existsSync(line));
    shellResolution = { command: command ?? null, path: pathLine && pathLine[1] ? pathLine[1].trim() : null };
  } catch {
    shellResolution = { command: null, path: null };
  }
  return shellResolution;
}

// Resolve claude, preferring the explicit setting (VISUALISE_CLAUDE_BIN, wired from the
// perceptor.claudePath setting), then the login shell, then whatever the inherited
// PATH can resolve. Returns an absolute path whenever possible so spawn() doesn't depend
// on the host process PATH.
function detectClaudeCommand(): string | null {
  const override = process.env["VISUALISE_CLAUDE_BIN"];
  if (override && override.trim()) {
    return override.trim();
  }
  const resolved = resolveViaLoginShell().command;
  if (resolved) {
    return resolved;
  }
  const probe = spawnSync("claude", ["--version"], { stdio: "ignore" });
  return probe.error ? null : "claude";
}

// PATH for the spawned claude: the user's real (login-shell) PATH so claude locates the
// tools it shells out to (git, rg, node…) exactly as it would in their terminal, with
// the binary's own directory ensured. No environment-specific paths hard-coded.
function childPath(command: string): string {
  const base = (resolveViaLoginShell().path || process.env["PATH"] || "").split(path.delimiter);
  const binDir = path.isAbsolute(command) ? path.dirname(command) : "";
  return [binDir, ...base].filter((entry, index, all) => entry && all.indexOf(entry) === index).join(path.delimiter);
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
      { cwd: rootDirectory, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PATH: childPath(this.command) } }
    );
    return new SpawnedRun(child, logPath);
  }
}
