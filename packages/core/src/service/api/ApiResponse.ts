import type { ApiError } from "./ApiError";

// The single envelope every RPC call answers with, discriminated by `success`:
// success carries `data` (that call's own payload), failure carries `error`. Both
// carry a `traceId` so a client-side report can be cross-referenced with logs, and
// a `timestamp` of the response moment. Never both branches at once — the factories
// enforce it. No `ok: boolean` grab-bag: narrow on `success` to get the branch.
export type SuccessResponse<T> = {
  success: true;
  data: T;
  traceId: string;
  timestamp: string;
};

export type ErrorResponse = {
  success: false;
  error: ApiError;
  traceId: string;
  timestamp: string;
};

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export function successResponse<T>(data: T, traceId: string): SuccessResponse<T> {
  return { success: true, data, traceId, timestamp: new Date().toISOString() };
}

export function errorResponse(error: ApiError, traceId: string): ErrorResponse {
  return { success: false, error, traceId, timestamp: new Date().toISOString() };
}
