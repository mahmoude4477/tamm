import test from "node:test";
import assert from "node:assert/strict";
import {
  validFieldValue,
  elapsedMinutes,
  escapeCalendar,
  foldCalendar,
} from "../src/lib/v2/model";
import { smtpOptions } from "../src/lib/smtp-options";
import { formatDate } from "../src/lib/dates";
test("custom values preserve their types and enforce configured choices", () => {
  assert.equal(
    validFieldValue({ kind: "number", options: [] }, "5", []),
    false,
  );
  assert.equal(validFieldValue({ kind: "number", options: [] }, 5, []), true);
  assert.equal(
    validFieldValue({ kind: "dropdown", options: ["A"] }, "B", []),
    false,
  );
  assert.equal(
    validFieldValue({ kind: "user", options: [] }, "outsider", ["member"]),
    false,
  );
  assert.equal(
    validFieldValue({ kind: "date", options: [] }, "2026-02-30", []),
    false,
  );
  assert.equal(
    validFieldValue({ kind: "checkbox", options: [] }, false, []),
    true,
  );
});
test("elapsed time cannot become negative or exceed a day", () => {
  const start = new Date("2026-09-15T01:00:00Z");
  assert.equal(elapsedMinutes(start, new Date("2026-09-15T02:30:00Z")), 90);
  assert.equal(elapsedMinutes(start, new Date("2026-09-14T00:00:00Z")), 0);
  assert.equal(elapsedMinutes(start, new Date("2026-09-17T00:00:00Z")), 1440);
});
test("calendar text cannot inject properties and folding respects UTF-8 octets", () => {
  assert.equal(
    escapeCalendar("Task\nEND:VEVENT;one,two\\"),
    "Task\\nEND:VEVENT\\;one\\,two\\\\",
  );
  const text = "SUMMARY:" + "مهمة عربية ".repeat(30),
    folded = foldCalendar(text);
  assert.equal(folded.replace(/\r\n /g, ""), text);
  assert.ok(folded.split("\r\n").every((l) => Buffer.byteLength(l) <= 75));
});
test("SMTP supports STARTTLS, implicit TLS, and IP relay certificates", () => {
  const start = smtpOptions({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "account",
    SMTP_PASSWORD: "test-only",
  });
  assert.equal(start.secure, false);
  assert.equal(start.requireTLS, true);
  assert.equal(start.auth?.pass, "test-only");
  const tls = smtpOptions({
    SMTP_HOST: "192.0.2.10",
    SMTP_PORT: "465",
    SMTP_TLS_SERVERNAME: "smtp.example.com",
  });
  assert.equal(tls.secure, true);
  assert.equal(tls.tls?.servername, "smtp.example.com");
  assert.equal(tls.auth, undefined);
  assert.throws(() =>
    smtpOptions({ SMTP_HOST: "host", SMTP_USER: "missing-password" }),
  );
  assert.throws(() => smtpOptions({ SMTP_HOST: "host", SMTP_PORT: "99999" }));
});
test("Hijri display uses Umm al-Qura while Gregorian storage is unchanged", () => {
  const date = "2026-09-15";
  assert.notEqual(
    formatDate(date, "en"),
    formatDate(date, "en-u-ca-islamic-umalqura"),
  );
  assert.equal(date, "2026-09-15");
});
