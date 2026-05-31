import { DomainException } from "./DomainException";
import { ERROR_CODES, type ErrorCode } from "../api/ErrorCode";

export class TaskNotFoundException extends DomainException {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`, { taskId });
  }

  errorCode(): ErrorCode {
    return ERROR_CODES.TASK_NOT_FOUND;
  }
}
