import { DomainException } from "./DomainException";
import { ERROR_CODES, type ErrorCode } from "../api/ErrorCode";

export class NotADirectoryException extends DomainException {
  constructor(path: string) {
    super(`Not a directory: ${path}`, { path });
  }

  errorCode(): ErrorCode {
    return ERROR_CODES.NOT_A_DIRECTORY;
  }
}
