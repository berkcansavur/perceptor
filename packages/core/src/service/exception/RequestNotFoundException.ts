import { DomainException } from "./DomainException";
import { ERROR_CODES, type ErrorCode } from "../api/ErrorCode";

export class RequestNotFoundException extends DomainException {
  constructor(requestId: string) {
    super(`Request not found: ${requestId}`, { requestId });
  }

  errorCode(): ErrorCode {
    return ERROR_CODES.REQUEST_NOT_FOUND;
  }
}
