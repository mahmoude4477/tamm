import type { Metadata } from "next";
import en from "@/messages/en.json";
import { cookies } from "next/headers";
import { resolveLocale, locales } from "@/lib/i18n";
import { LocaleProvider } from "@/components/locale-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: en.meta.title,
  description: en.meta.description,
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = resolveLocale((await cookies()).get("tamm-locale")?.value);
  return (
    <html lang={locale} dir={locales[locale].dir}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
