"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import {
  LocalePicker,
  useMessages,
  useDates,
} from "@/components/locale-provider";
export function AccountFlow({
  mode,
}: {
  mode: "forgot" | "reset" | "twoFactor" | "invite";
}) {
  const en = useMessages();

  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [backup, setBackup] = useState(false);
  return (
    <main className="auth-page">
      <LocalePicker />
      <Link className="brand" href="/">
        {en.brand.name} <span lang="ar">{en.brand.arabic}</span>
      </Link>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          const f = new FormData(e.currentTarget);
          try {
            let result;
            const query = new URLSearchParams(window.location.search);
            if (mode === "forgot")
              result = await authClient.requestPasswordReset({
                email: String(f.get("email")),
                redirectTo: "/reset-password",
              });
            else if (mode === "reset")
              result = await authClient.resetPassword({
                token: query.get("token") ?? "",
                newPassword: String(f.get("password")),
              });
            else if (mode === "twoFactor")
              result = backup
                ? await authClient.twoFactor.verifyBackupCode({
                    code: String(f.get("code")),
                  })
                : await authClient.twoFactor.verifyTotp({
                    code: String(f.get("code")),
                  });
            else
              result = await authClient.organization.acceptInvitation({
                invitationId: query.get("id") ?? "",
              });
            if (result.error) setMessage(en.common.error);
            else if (mode === "forgot") setMessage(en.account.resetSent);
            else
              window.location.assign(
                mode === "reset" ? "/login" : "/workspace",
              );
          } catch {
            setMessage(en.common.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>
          {mode === "forgot"
            ? en.account.forgot
            : mode === "reset"
              ? en.account.reset
              : mode === "twoFactor"
                ? en.account.twoFactor
                : en.account.inviteTitle}
        </h1>
        {mode === "forgot" && (
          <label>
            {en.account.email}
            <input name="email" type="email" autoComplete="email" required />
          </label>
        )}
        {mode === "reset" && (
          <label>
            {en.account.newPassword}
            <input
              name="password"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
        )}
        {mode === "twoFactor" && (
          <>
            <label>
              {backup ? en.account.recoveryCode : en.account.code}
              <input
                name="code"
                autoComplete="one-time-code"
                inputMode={backup ? "text" : "numeric"}
                required
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={backup}
                onChange={(e) => setBackup(e.target.checked)}
              />
              {en.account.recoveryCode}
            </label>
          </>
        )}
        {mode === "invite" && <p>{en.account.inviteHint}</p>}
        <Button disabled={busy}>
          {mode === "forgot"
            ? en.account.sendReset
            : mode === "reset"
              ? en.account.reset
              : mode === "invite"
                ? en.account.accept
                : en.account.verify}
        </Button>
        <p role="status">{message}</p>
        <Link href="/login">{en.account.back}</Link>
      </form>
    </main>
  );
}
