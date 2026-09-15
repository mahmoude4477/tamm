# Email setup

[Back to README](../README.md) · [العربية](smtp.ar.md)

Tamm sends account verification, password recovery, invitations, and opted-in task notifications using the same SMTP configuration. Put credentials in `.env.local` or your service's environment. They are read on the server and are never entered in a public repository or browser settings page.

## What to ask your mail administrator

Ask for the **SMTP server hostname (or IP)**, **port**, **TLS mode**, **sender address**, and, if required, **username and password**. The username is often an email address, but your provider decides. Some providers require an application password or an approved relay rather than your usual mailbox password. An internal relay may authorize the application server's IP and require no username/password.

## Typical authenticated server: port 587

```dotenv
MAIL_TRANSPORT=smtp
MAIL_FROM="Tamm <notifications@example.com>"
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=notifications@example.com
SMTP_PASSWORD=
```

Fill `SMTP_PASSWORD` privately with the credential supplied for SMTP. On port 587, `SMTP_SECURE=false` means STARTTLS upgrades the connection; `SMTP_REQUIRE_TLS=true` makes that upgrade mandatory.

## Implicit TLS: port 465

Use the same configuration with:

```dotenv
SMTP_PORT=465
SMTP_SECURE=true
```

## Internal relay or IP address

Use the exact settings supplied by your administrator. If the relay does not require authentication, leave **both** `SMTP_USER` and `SMTP_PASSWORD` empty. Do not assume an internal IP automatically authorizes sending.

If connecting to an IP, specify the hostname on its TLS certificate:

```dotenv
SMTP_HOST=192.0.2.10
SMTP_TLS_SERVERNAME=mail.example.com
```

For an internal certificate authority, configure Node.js to trust its certificate with `NODE_EXTRA_CA_CERTS`. Certificate validation remains enabled. Only set `SMTP_REQUIRE_TLS=false` if your administrator explicitly specifies a trusted relay that does not support STARTTLS. Port 25 is sometimes used for such relays; do not use it unless instructed.

## Check the connection

```bash
npm run mail:check
```

This verifies the connection and authentication without sending email. A successful check does not prove the server will accept every sender or deliver to every mailbox. Restart the app and worker after changing their environment. Keep the scheduled worker running for due-date reminders and task notification email; account and invitation emails are sent by the app directly.

## Local development

`MAIL_TRANSPORT=file` writes messages to `.data/mail`. It never sends them over SMTP even if SMTP keys are present. Change it to `smtp` for delivery. The file transport is disabled in production unless explicitly enabled for testing.

Reference: [Nodemailer SMTP transport](https://nodemailer.com/smtp).
