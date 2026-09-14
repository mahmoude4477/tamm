import en from "@/messages/en.json";
export const today = (timeZone = "UTC") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function formatDate(
  value: string | null,
  locale = "en",
  timeZone = "UTC",
  fallback = en.common.noDate,
) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : timeZone,
      }).format(new Date(value))
    : fallback;
}
