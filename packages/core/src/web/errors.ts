import { t } from "./i18n";

// A thrown value carrying a stable machine `code` — what ApiClient rejects with on a
// failed call. Duck-typed (not `instanceof ApiCallError`) so this module stays importable
// in node/test runtimes, where ApiClient's module-level acquireVsCodeApi() would throw.
function errorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" && code.length > 0 ? code : null;
  }
  return null;
}

// Turns any caught value into a localised, user-facing message. A coded API error maps to
// its `err.<CODE>` string; anything else (unknown code, plain Error, non-Error throw)
// falls back to the generic message. Raw English from the host never reaches the user.
export function errorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code) {
    const key = `err.${code}`;
    const message = t(key);
    if (message !== key) {
      return message;
    }
  }
  return t("err.generic");
}
