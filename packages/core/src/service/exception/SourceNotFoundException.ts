import { DomainException } from "./DomainException";
import { ERROR_CODES, type ErrorCode } from "../api/ErrorCode";

export class SourceNotFoundException extends DomainException {
  constructor(file: string) {
    super(`Source file not found: ${file}`, { file });
  }

  errorCode(): ErrorCode {
    return ERROR_CODES.SOURCE_NOT_FOUND;
  }
}
