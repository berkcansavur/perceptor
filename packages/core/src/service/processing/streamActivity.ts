// Turns one line of `claude --output-format stream-json` into a short, human
// "what Claude is doing right now" label — its narration text, or the tool it just
// invoked. Returns null for lines that carry no user-facing activity.

const MAX_LENGTH = 100;

type StreamToolInput = {
  file_path?: unknown;
  path?: unknown;
  pattern?: unknown;
  description?: unknown;
}

type StreamContentItem = {
  type?: unknown;
  text?: unknown;
  name?: unknown;
  input?: StreamToolInput;
}

type StreamEvent = {
  type?: unknown;
  message?: { content?: unknown };
}

export type StreamUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

type ResultUsage = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
}

type ResultEvent = {
  type?: unknown;
  total_cost_usd?: unknown;
  usage?: ResultUsage;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// The final `result` event of a stream-json run carries the run's cumulative token
// usage and cost. Returns null for any other line. One result event per run.
export function usageFromStreamLine(line: string): StreamUsage | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  let event: ResultEvent;
  try {
    event = JSON.parse(trimmed) as ResultEvent;
  } catch {
    return null;
  }
  if (!event || event.type !== "result" || !event.usage) {
    return null;
  }
  return {
    inputTokens: asNumber(event.usage.input_tokens),
    outputTokens: asNumber(event.usage.output_tokens),
    cacheReadTokens: asNumber(event.usage.cache_read_input_tokens),
    cacheCreationTokens: asNumber(event.usage.cache_creation_input_tokens),
    costUsd: asNumber(event.total_cost_usd),
  };
}

export function activityFromStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  let event: StreamEvent;
  try {
    event = JSON.parse(trimmed) as StreamEvent;
  } catch {
    return null;
  }
  if (!event || event.type !== "assistant" || !event.message) {
    return null;
  }
  const content = event.message.content;
  if (!Array.isArray(content)) {
    return null;
  }
  for (const item of content as StreamContentItem[]) {
    if (item && item.type === "tool_use") {
      return labelForTool(String(item.name ?? ""), item.input ?? {});
    }
    if (item && item.type === "text" && typeof item.text === "string" && item.text.trim()) {
      return truncate(item.text.trim());
    }
  }
  return null;
}

function labelForTool(name: string, input: StreamToolInput): string {
  const target = basename(asString(input.file_path) || asString(input.path));
  switch (name) {
    case "Read":
      return target ? `Reading ${target}` : "Reading files";
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return target ? `Editing ${target}` : "Editing files";
    case "Bash":
      return asString(input.description) ? truncate(asString(input.description)) : "Running a command";
    case "Grep":
    case "Glob":
      return asString(input.pattern) ? `Searching “${truncate(asString(input.pattern), 40)}”` : "Searching the repo";
    case "Task":
      return "Exploring the codebase";
    case "TodoWrite":
      return "Planning the work";
    default:
      return name ? `${name}…` : "Working…";
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function basename(filePath: string): string {
  return filePath.replace(/\/+$/, "").split("/").pop() ?? "";
}

function truncate(text: string, max = MAX_LENGTH): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
