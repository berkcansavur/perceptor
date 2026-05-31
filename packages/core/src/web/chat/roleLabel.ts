import { t } from "../i18n";

// One label for a message author across Chat and Changes — the user is always
// "you", never the raw "user" role.
export function roleLabel(role: string): string {
  return role === "user" ? t("chat.you") : role;
}
