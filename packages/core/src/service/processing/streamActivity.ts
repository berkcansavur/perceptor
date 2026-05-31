// Turns one line of `claude --output-format stream-json` into a short, human
// "what Claude is doing right now" label — its narration text, or the tool it just
// invoked. Returns null for lines that carry no user-facing activity.
//
// The lines are external process output we don't own, so a parsed line is genuinely an
// unknown object: we keep it as a raw record and read each field through a presence-checked
// accessor into clean typed values — no optional `?: unknown` shape pretending to know it.

const MAX_LENGTH = 100;

export type StreamUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

function parseLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// The final `result` event of a stream-json run carries the run's cumulative token
// usage and cost. Returns null for any other line. One result event per run.
export function usageFromStreamLine(line: string): StreamUsage | null {
  const event = parseLine(line);
  if (!event || event["type"] !== "result") {
    return null;
  }
  const usage = asRecord(event["usage"]);
  if (!usage) {
    return null;
  }
  return {
    inputTokens: asNumber(usage["input_tokens"]),
    outputTokens: asNumber(usage["output_tokens"]),
    cacheReadTokens: asNumber(usage["cache_read_input_tokens"]),
    cacheCreationTokens: asNumber(usage["cache_creation_input_tokens"]),
    costUsd: asNumber(event["total_cost_usd"]),
  };
}

export function activityFromStreamLine(line: string): string | null {
  const event = parseLine(line);
  if (!event || event["type"] !== "assistant") {
    return null;
  }
  const message = asRecord(event["message"]);
  if (!message) {
    return null;
  }
  return labelForContent(asArray(message["content"]));
}

function labelForContent(content: unknown[]): string | null {
  for (const raw of content) {
    const contentItem = asRecord(raw);
    if (!contentItem) {
      continue;
    }
    if (contentItem["type"] === "tool_use") {
      return labelForTool(asString(contentItem["name"]), asRecord(contentItem["input"]) ?? {});
    }
    if (contentItem["type"] === "text" && asString(contentItem["text"]).trim()) {
      return truncate(asString(contentItem["text"]).trim());
    }
  }
  return null;
}

function labelForTool(name: string, input: Record<string, unknown>): string {
  const target = basename(asString(input["file_path"]) || asString(input["path"]));
  switch (name) {
    case "Read":
      return target ? `Reading ${target}` : "Reading files";
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return target ? `Editing ${target}` : "Editing files";
    case "Bash":
      return asString(input["description"]) ? truncate(asString(input["description"])) : "Running a command";
    case "Grep":
    case "Glob":
      return asString(input["pattern"]) ? `Searching “${truncate(asString(input["pattern"]), 40)}”` : "Searching the repo";
    case "Task":
      return "Exploring the codebase";
    case "TodoWrite":
      return "Planning the work";
    default:
      return name ? `${name}…` : "Working…";
  }
}

function basename(filePath: string): string {
  return filePath.replace(/\/+$/, "").split("/").pop() ?? "";
}

function truncate(text: string, max = MAX_LENGTH): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
