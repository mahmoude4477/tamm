import english from "@/messages/en.json";
import arabic from "@/messages/ar.json";
export type Messages = typeof english;
export type Locale = "en" | "ar";
export const locales: Record<Locale, { label: string; dir: "ltr" | "rtl" }> = {
  en: { label: english.localeNames.en, dir: "ltr" },
  ar: { label: english.localeNames.ar, dir: "rtl" },
};
function merge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      value && typeof value === "object" && !Array.isArray(value)
        ? merge(
            value as Record<string, unknown>,
            (override[key] ?? {}) as Record<string, unknown>,
          )
        : (override[key] ?? value),
    ]),
  );
}
export function getMessages(locale: string): Messages {
  return locale === "ar" ? (merge(english, arabic) as Messages) : english;
}
export function resolveLocale(value: string | undefined): Locale {
  return value === "ar" ? "ar" : "en";
}
