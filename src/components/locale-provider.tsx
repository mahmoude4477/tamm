"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { Languages, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./ui/dropdown-menu";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { createContext, useContext, useState, useMemo, useEffect } from "react";
import { getMessages, locales, type Locale, type Messages } from "@/lib/i18n";
import { formatDate, today } from "@/lib/dates";
const Context = createContext<{
  locale: Locale;
  messages: Messages;
  timezone: string;
  hijri: boolean;
  setHijri: (v: boolean) => void;
  setTimezone: (v: string) => void;
}>({
  locale: "en",
  messages: getMessages("en"),
  timezone: "UTC",
  hijri: false,
  setHijri: () => {},
  setTimezone: () => {},
});
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [hijri, setHijriState] = useState(false);
  useEffect(() => {
    try {
      setHijriState(localStorage.getItem("tamm-hijri") === "true");
    } catch {}
  }, []);
  const setHijri = (v: boolean) => {
    setHijriState(v);
    try {
      localStorage.setItem("tamm-hijri", String(v));
    } catch {}
  };
  const [timezone, setTimezone] = useState("UTC");
  const value = useMemo(
    () => ({
      locale,
      messages: getMessages(locale),
      timezone,
      setTimezone,
      hijri,
      setHijri,
    }),
    [locale, timezone, hijri],
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
  const { locale, timezone, messages, hijri } = useLocale();
  return {
    today: () => today(timezone),
    formatDate: (value: string | null) =>
      formatDate(
        value,
        hijri ? `${locale}-u-ca-islamic-umalqura` : locale,
        timezone,
        messages.common.noDate,
      ),
  };
}
export function LocalePicker() {
  const { locale, messages } = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="language-trigger"
        aria-label={messages.common.language}
      >
        <Languages size={17} />
        <span>{locales[locale].label}</span>
        <ChevronDown size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="language-menu">
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            if (value === locale || !(value in locales)) return;
            document.cookie = `tamm-locale=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
            window.location.reload();
          }}
        >
          {Object.entries(locales).map(([id, language]) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <span lang={id} dir={language.dir}>
                {language.label}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function DatePreference() {
  const { messages, hijri, setHijri } = useLocale();
  return (
    <label className="date-preference">
      <Checkbox checked={hijri} onCheckedChange={setHijri} />
      {messages.v2.hijri}
    </label>
  );
}
