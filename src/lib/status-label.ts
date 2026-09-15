import english from "@/messages/en.json";
import arabic from "@/messages/ar.json";
import type { Messages } from "./i18n";
import type { Status } from "./types";

/** Translate only unchanged, system-created statuses; custom names remain user data. */
export function statusLabel(
  status: Status | undefined,
  messages: Messages,
): string {
  if (!status) return "";
  const match = status.id.match(/(?:^|-)status-(\d+)$/);
  const index = match ? Number(match[1]) : -1;
  if (
    index >= 0 &&
    index < english.demo.statuses.length &&
    [english.demo.statuses[index], arabic.demo.statuses[index]].includes(
      status.name,
    )
  ) {
    return messages.demo.statuses[index];
  }
  return status.name;
}
