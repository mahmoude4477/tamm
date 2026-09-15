import type { Metadata } from "next";
import { cookies } from "next/headers";
import { resolveLocale, locales, getMessages } from "@/lib/i18n";
import { LocaleProvider } from "@/components/locale-provider";
import "./globals.css";
export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveLocale((await cookies()).get("tamm-locale")?.value);
  const messages = getMessages(locale);
  return { title: messages.meta.title, description: messages.meta.description };
}
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
