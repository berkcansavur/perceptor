import type { ErrorCode } from "../api/ErrorCode";

// Base for every business-rule failure the service throws. A recoverable / user-visible
// failure is a DomainException — one concrete subclass per case so the funnel maps it to
// a precise ErrorCode without string matching, and the catch-site can tell them apart.
// Truly unexpected failures (IO, programmer error) are NOT domain exceptions — those fall
// through to the funnel's catch-all as INTERNAL_ERROR.
export abstract class DomainException extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }

  abstract errorCode(): ErrorCode;

  // Explicit message, or the code's default when blank — keeps subclasses terse.
  resolvedMessage(): string {
    return this.message.trim() ? this.message : this.errorCode().message;
  }
}
