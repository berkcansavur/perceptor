import { DomainException } from "./DomainException";
import { ERROR_CODES, type ErrorCode } from "../api/ErrorCode";

export class InvalidNameException extends DomainException {
  constructor(name: string) {
    super(`Invalid name: ${name}`, { name });
  }

  errorCode(): ErrorCode {
    return ERROR_CODES.INVALID_NAME;
  }
}
