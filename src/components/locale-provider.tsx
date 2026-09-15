"use client";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { createContext, useContext, useState, useMemo } from "react";
import { getMessages, locales, type Locale, type Messages } from "@/lib/i18n";
import { formatDate, today } from "@/lib/dates";
const Context = createContext<{
  locale: Locale;
  messages: Messages;
  timezone: string;
  setTimezone: (v: string) => void;
}>({
  locale: "en",
  messages: getMessages("en"),
  timezone: "UTC",
  setTimezone: () => {},
});
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [timezone, setTimezone] = useState("UTC");
  const value = useMemo(
    () => ({ locale, messages: getMessages(locale), timezone, setTimezone }),
    [locale, timezone],
  );
  return (
    <DirectionProvider direction={locales[locale].dir}>
      <Context.Provider value={value}>{children}</Context.Provider>
    </DirectionProvider>
  );
}
export function useMessages() {
  return useContext(Context).messages;
}
export function useLocale() {
  return useContext(Context);
}
export function useDates() {
  const { locale, timezone, messages } = useLocale();
  return {
    today: () => today(timezone),
    formatDate: (value: string | null) =>
      formatDate(value, locale, timezone, messages.common.noDate),
  };
}
export function LocalePicker() {
  const { locale, messages } = useLocale();
  return (
    <label className="locale-picker">
      {messages.common.language}
      <select
        value={locale}
        onChange={(e) => {
          document.cookie = `tamm-locale=${e.target.value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
          window.location.reload();
        }}
      >
        {Object.entries(locales).map(([id, l]) => (
          <option key={id} value={id}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
