"use client";
import { Input } from "@/components/ui/input";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import {
  DatePreference,
  useMessages,
  useDates,
} from "@/components/locale-provider";
export function AccountPanel() {
  const en = useMessages();

  const { data: session } = authClient.useSession();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [sessions, setSessions] = useState<
      {
        token: string;
        userAgent?: string | null;
        createdAt: Date;
        id: string;
      }[]
    >([]),
    [keys, setKeys] = useState<{ id: string; name?: string | null }[]>([]),
    [qr, setQr] = useState(""),
    [codes, setCodes] = useState<string[]>([]);
  async function refresh() {
    const [s, p] = await Promise.all([
      authClient.listSessions(),
      authClient.passkey.listUserPasskeys(),
    ]);
    if (s.data) setSessions(s.data);
    if (p.data) setKeys(p.data);
  }
  useEffect(() => {
    refresh().catch(() => setMessage(en.common.error));
  }, []);
  async function run(fn: () => Promise<{ error?: unknown }>) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fn();
      if (r.error) setMessage(en.common.error);
      else {
        setMessage(en.account.saved);
        await refresh();
      }
    } catch {
      setMessage(en.common.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detail-section">
      <h2>{en.account.title}</h2>
      <DatePreference />
      <form
        className="editor-form"
        key={session?.user.id}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() =>
            authClient.updateUser({
              name: String(f.get("name")),
              image: String(f.get("image")) || null,
            }),
          );
        }}
      >
        <label>
          {en.account.name}
          <Input
            name="name"
            defaultValue={session?.user.name}
            required
            maxLength={100}
          />
        </label>
        <label>
          {en.account.photo}
          <Input
            type="url"
            name="image"
            defaultValue={session?.user.image ?? ""}
            maxLength={2000}
          />
        </label>
        <Button disabled={busy}>{en.common.save}</Button>
      </form>
      <h3>{en.account.sessions}</h3>
      {sessions.map((s) => (
        <div className="restore-row" key={s.id}>
          <span>
            {s.userAgent ?? en.account.sessions}
            {s.id === session?.session.id && ` · ${en.account.current}`}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || s.id === session?.session.id}
            onClick={() =>
              run(() => authClient.revokeSession({ token: s.token }))
            }
          >
            {en.account.revoke}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => run(() => authClient.revokeOtherSessions())}
      >
        {en.account.revokeOthers}
      </Button>
      <h3>{en.account.twoFactor}</h3>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          const password = String(
            new FormData(e.currentTarget).get("password"),
          );
          run(async () => {
            if (session?.user.twoFactorEnabled)
              return authClient.twoFactor.disable({ password });
            const r = await authClient.twoFactor.enable({ password });
            if (r.data && r.data.method === "totp") {
              setQr(await QRCode.toDataURL(r.data.totpURI));
              setCodes(r.data.backupCodes);
            }
            return r;
          });
        }}
      >
        <label>
          {en.account.password}
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <Button disabled={busy}>
          {session?.user.twoFactorEnabled
            ? en.account.disable
            : en.account.enable}
        </Button>
      </form>
      {qr && (
        <div>
          <p>{en.account.authenticator}</p>
          <img
            src={qr}
            width={220}
            height={220}
            alt={en.account.authenticator}
          />
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("code"));
              run(async () => {
                const r = await authClient.twoFactor.verifyTotp({ code });
                if (!r.error) setQr("");
                return r;
              });
            }}
          >
            <label>
              {en.account.code}
              <Input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </label>
            <Button disabled={busy}>{en.account.verify}</Button>
          </form>
        </div>
      )}
      {codes.length > 0 && (
        <div>
          <p>{en.account.backupCodes}</p>
          <pre>{codes.join("\n")}</pre>
          <Button variant="outline" onClick={() => setCodes([])}>
            {en.common.close}
          </Button>
        </div>
      )}
      <h3>{en.account.passkeys}</h3>
      {keys.map((k) => (
        <div className="restore-row" key={k.id}>
          <span>{k.name ?? en.account.passkeys}</span>
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() =>
              run(() => authClient.passkey.deletePasskey({ id: k.id }))
            }
          >
            {en.account.remove}
          </Button>
        </div>
      ))}
      <Button
        disabled={busy}
        variant="outline"
        onClick={() =>
          run(
            async () =>
              (await authClient.passkey.addPasskey({ name: en.brand.name })) ??
              {},
          )
        }
      >
        {en.account.addPasskey}
      </Button>
      <p role="status">{message}</p>
    </section>
  );
}
