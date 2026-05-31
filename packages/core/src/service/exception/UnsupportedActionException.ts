import { DomainException } from "./DomainException";
import { ERROR_CODES, type ErrorCode } from "../api/ErrorCode";

// A host that didn't wire an optional capability (e.g. the CLI/web host has no editor
// to open a file in) reports the action as unsupported rather than crashing.
export class UnsupportedActionException extends DomainException {
  constructor(action: string) {
    super(`Action not supported in this host: ${action}`, { action });
  }

  errorCode(): ErrorCode {
    return ERROR_CODES.UNSUPPORTED;
  }
}
