import type { CommandHandler } from "./CommandHandler";

// Base for every command: owns the transport concern of turning an untyped RPC payload
// into typed values, so concrete commands stay a single intent line. `Result` is the
// command's determined output — each subclass binds it (typically to its CoreService
// method's return), so `handle` is precisely typed, never `unknown`.
export abstract class Command<Result> implements CommandHandler<Result> {
  abstract readonly action: string;

  abstract handle(payload: Record<string, unknown>): Promise<Result> | Result;

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
