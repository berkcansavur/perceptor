// Failure payload inside an ErrorResponse. `code` is the machine-readable ErrorCode
// name the client switches on to drive UX; `message` is fallback human display;
// `details` is free-form case context (e.g. the offending id, validation fields).
// Built by the funnel from a DomainException — call sites never assemble these.
export type ApiError = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

export function apiError(code: string, message: string, details: Record<string, unknown> = {}): ApiError {
  return { code, message, details };
}
