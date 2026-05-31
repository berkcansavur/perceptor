// Single source of truth for every business / framework error the service can emit.
// Each entry pairs a stable machine code (the `name` → wire) with the HTTP status the
// funnel maps to and a default human-readable message. Stable contract: never rename an
// existing name (clients switch on it), only add. Status is a raw int so this stays
// transport-neutral — an HTTP adapter resolves it, the webview just reads the code.
export type ErrorCodeName =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNSUPPORTED"
  | "INTERNAL_ERROR"
  | "UNKNOWN_ACTION"
  | "TASK_NOT_FOUND"
  | "REQUEST_NOT_FOUND"
  | "NOT_A_DIRECTORY"
  | "OUT_OF_REPO"
  | "SOURCE_NOT_FOUND"
  | "INVALID_NAME"
  | "FILE_EXISTS";

export type ErrorCode = {
  name: ErrorCodeName;
  status: number;
  message: string;
};

export const ERROR_CODES: Record<ErrorCodeName, ErrorCode> = {
  BAD_REQUEST: { name: "BAD_REQUEST", status: 400, message: "Bad request" },
  NOT_FOUND: { name: "NOT_FOUND", status: 404, message: "Resource not found" },
  CONFLICT: { name: "CONFLICT", status: 409, message: "Resource conflict" },
  FORBIDDEN: { name: "FORBIDDEN", status: 403, message: "Forbidden" },
  UNSUPPORTED: { name: "UNSUPPORTED", status: 501, message: "Action not supported in this host" },
  INTERNAL_ERROR: { name: "INTERNAL_ERROR", status: 500, message: "Unexpected server error" },
  UNKNOWN_ACTION: { name: "UNKNOWN_ACTION", status: 400, message: "Unknown action" },
  TASK_NOT_FOUND: { name: "TASK_NOT_FOUND", status: 404, message: "Task not found" },
  REQUEST_NOT_FOUND: { name: "REQUEST_NOT_FOUND", status: 404, message: "Request not found" },
  NOT_A_DIRECTORY: { name: "NOT_A_DIRECTORY", status: 400, message: "Path is not a directory" },
  OUT_OF_REPO: { name: "OUT_OF_REPO", status: 403, message: "Path is outside the repository" },
  SOURCE_NOT_FOUND: { name: "SOURCE_NOT_FOUND", status: 404, message: "Source file not found" },
  INVALID_NAME: { name: "INVALID_NAME", status: 400, message: "Invalid name" },
  FILE_EXISTS: { name: "FILE_EXISTS", status: 409, message: "File already exists" },
};
