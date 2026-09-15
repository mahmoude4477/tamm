import nodemailer from "nodemailer";
import { smtpOptions } from "../src/lib/smtp-options";
const transport = nodemailer.createTransport(smtpOptions());
try {
  await transport.verify();
  console.log(
    "SMTP connection and authentication succeeded. No email was sent. Sender acceptance still depends on the server policy.",
  );
} catch (e) {
  console.error(
    "SMTP verification failed.",
    typeof e === "object" && e && "code" in e
      ? e.code
      : "CONFIGURATION_OR_CONNECTION",
  );
  process.exitCode = 1;
} finally {
  transport.close();
}
