import { DomainException } from "../exception/DomainException";
import { ERROR_CODES } from "./ErrorCode";
import { apiError } from "./ApiError";
import { errorResponse, type ErrorResponse } from "./ApiResponse";

// The single funnel every thrown value passes through at the dispatch boundary —
// the TypeScript counterpart of a Spring @RestControllerAdvice. A DomainException
// carries its own code/message/details; anything else funnels to INTERNAL_ERROR so a
// raw stack trace or message can never reach the client. The detail (stack/cause)
// stays in the log, keyed by the same traceId that goes out on the wire.
export class ExceptionFunnel {
  constructor(private readonly log: (message: string) => void = (message) => console.error(message)) {}

  toErrorResponse(error: unknown, traceId: string): ErrorResponse {
    if (error instanceof DomainException) {
      const code = error.errorCode();
      this.log(`[${traceId}] domain ${code.name}: ${error.resolvedMessage()}`);
      return errorResponse(apiError(code.name, error.resolvedMessage(), error.details), traceId);
    }
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    this.log(`[${traceId}] unhandled: ${detail}`);
    const code = ERROR_CODES.INTERNAL_ERROR;
    return errorResponse(apiError(code.name, code.message), traceId);
  }
}
