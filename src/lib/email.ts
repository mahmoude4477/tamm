import "server-only";
import nodemailer from "nodemailer";
import { smtpOptions } from "./smtp-options";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
export function mailConfigured() {
  return !!process.env.SMTP_HOST || process.env.MAIL_TRANSPORT === "file";
}
export async function sendMail(to: string, subject: string, text: string) {
  if (process.env.MAIL_TRANSPORT === "file") {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_FILE_MAIL !== "true"
    )
      throw new Error("File email transport is disabled in production");
    const dir = resolve(
      /*turbopackIgnore: true*/ process.env.MAIL_DIRECTORY || ".data/mail",
    );
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(/*turbopackIgnore: true*/ dir, crypto.randomUUID() + ".json"),
      JSON.stringify({ to, subject, text }),
      { mode: 0o600 },
    );
    return;
  }
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM)
    throw new Error("Email transport is not configured");
  const transport = nodemailer.createTransport(smtpOptions());
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
}
