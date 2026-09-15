import { z } from "zod";
export function smtpOptions(env: Record<string, string | undefined> = process.env) {
  const host = z.string().trim().min(1).parse(env.SMTP_HOST),
    port = z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.SMTP_PORT || 587);
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
    throw Error(
      "SMTP_USER and SMTP_PASSWORD must both be set, or both omitted for an internal relay.",
    );
  if (
    (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE)) ||
    (env.SMTP_REQUIRE_TLS && !["true", "false"].includes(env.SMTP_REQUIRE_TLS))
  )
    throw Error("SMTP TLS options must be true or false.");
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  return {
    host,
    port,
    secure,
    requireTLS: !secure && env.SMTP_REQUIRE_TLS !== "false",
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD! }
      : undefined,
    tls: env.SMTP_TLS_SERVERNAME
      ? { servername: env.SMTP_TLS_SERVERNAME }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
