import { DomainException } from "./DomainException";
import { ERROR_CODES, type ErrorCode } from "../api/ErrorCode";

export class FileExistsException extends DomainException {
  constructor(path: string) {
    super(`File already exists: ${path}`, { path });
  }

  errorCode(): ErrorCode {
    return ERROR_CODES.FILE_EXISTS;
  }
}
