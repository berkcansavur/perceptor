import { DomainException } from "./DomainException";
import { ERROR_CODES, type ErrorCode } from "../api/ErrorCode";

export class UnknownActionException extends DomainException {
  constructor(action: string) {
    super(`Unknown action: ${action}`, { action });
  }

  errorCode(): ErrorCode {
    return ERROR_CODES.UNKNOWN_ACTION;
  }
}
