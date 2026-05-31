import type { CommandHandler } from "./CommandHandler";
import type { EmptyRequest } from "../types";

// Base for every command. The RPC delivers an untyped record over IPC; `parse` is the
// ONE place a command turns that into its typed `Request`, and `run` then expresses the
// intent over fully typed input. `handle` (the registry's entry point) just wires them,
// so no concrete command body ever touches `Record<string, unknown>`. `Result` is the
// command's determined output — each subclass binds it (typically to its CoreService
// method's return), so `run` is precisely typed, never `unknown`.
export abstract class Command<Request, Result> implements CommandHandler<Result> {
  abstract readonly action: string;

  protected abstract parse(payload: Record<string, unknown>): Request;

  protected abstract run(request: Request): Promise<Result> | Result;

  handle(payload: Record<string, unknown>): Promise<Result> | Result {
    return this.run(this.parse(payload));
  }

  protected text(payload: Record<string, unknown>, key: string, fallback = ""): string {
    const value = payload[key];
    return value === undefined || value === null ? fallback : String(value);
  }

  protected count(payload: Record<string, unknown>, key: string, fallback: number): number {
    const value = payload[key];
    return value === undefined || value === null ? fallback : Number(value);
  }

  protected flag(payload: Record<string, unknown>, key: string): boolean {
    return Boolean(payload[key]);
  }

  protected optionalText(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    return typeof value === "string" ? value : null;
  }
}

// For actions that carry no request body: `parse` yields the empty request, so a
// concrete command only implements `run()`.
export abstract class PayloadlessCommand<Result> extends Command<EmptyRequest, Result> {
  protected parse(): EmptyRequest {
    return {};
  }
}
