import { DomainException } from "./DomainException";
import { ERROR_CODES, type ErrorCode } from "../api/ErrorCode";

export class OutOfRepoException extends DomainException {
  constructor(path: string) {
    super(`Path is outside the repository: ${path}`, { path });
  }

  errorCode(): ErrorCode {
    return ERROR_CODES.OUT_OF_REPO;
  }
}
