import en from "@/messages/en.json";
export const today = () => new Date().toISOString().slice(0, 10);
export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : en.common.noDate;
}
