"use client";
import { readRequest } from "@/lib/read-request";
import { Input } from "@/components/ui/input";
import { FormSelect, SelectOption } from "@/components/ui/form-select";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import type { Workspace } from "@/lib/types";
import { useMessages, useDates, useLocale } from "@/components/locale-provider";
export function WorkspaceSwitcher({ w }: { w: Workspace }) {
  const { locale, timezone } = useLocale();

  const en = useMessages();

  const [items, setItems] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    readRequest("/api/auth/organization/list", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const items = await r.json();
        if (!controller.signal.aborted) setItems(items);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(en.common.error);
      });
    return () => controller.abort();
  }, [w.id, en.common.error]);
  return (
    <div className="workspace-switcher">
      <label>
        {en.account.workspace}
        <FormSelect
          value={w.id}
          onValueChange={async (value) => {
            const r = await authClient.organization.setActive({
              organizationId: value,
            });
            if (r.error) setError(en.common.error);
            else window.location.assign("/workspace");
          }}
        >
          {items.map((o) => (
            <SelectOption key={o.id} value={o.id}>
              {o.name}
            </SelectOption>
          ))}
        </FormSelect>
      </label>
      <details>
        <summary>{en.account.createWorkspace}</summary>
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name"));
            try {
              const r = await fetch("/api/workspace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "workspace.create", name }),
              });
              if (!r.ok) throw Error();
              const data = await r.json();
              const active = await authClient.organization.setActive({
                organizationId: data.workspace.id,
              });
              if (active.error) throw Error();
              window.location.assign("/workspace");
            } catch {
              setError(en.common.error);
            }
          }}
        >
          <label>
            {en.admin.name}
            <Input name="name" required maxLength={100} />
          </label>
          <Button>{en.account.createWorkspace}</Button>
        </form>
      </details>
      <p role="alert">{error}</p>
    </div>
  );
}
export function InvitationPanel({ w }: { w: Workspace }) {
  const { locale, timezone } = useLocale();

  const en = useMessages();

  const [items, setItems] = useState<
      { id: string; email: string; status: string; expiresAt: Date }[]
    >([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function refresh() {
    const r = await authClient.organization.listInvitations({
      query: { organizationId: w.id },
    });
    if (r.error) throw Error();
    setItems(r.data ?? []);
  }
  useEffect(() => {
    refresh().catch(() => setMessage(en.common.error));
  }, [w.id]);
  return (
    <section>
      <h2>{en.account.invitations}</h2>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          setBusy(true);
          try {
            const r = await authClient.organization.inviteMember({
              organizationId: w.id,
              email: String(f.get("email")),
              role: String(f.get("role")) as "member",
              teamId: String(f.get("teamId")) || undefined,
            });
            if (r.error) throw Error();
            await refresh();
            form.reset();
            setMessage(en.account.saved);
          } catch {
            setMessage(en.common.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {en.account.email}
          <Input name="email" type="email" required />
        </label>
        <label>
          {en.account.role}
          <FormSelect name="role">
            {["member", "viewer", "manager", "admin"].map((role) => (
              <SelectOption key={role} value={role}>
                {en.team.roles[role as keyof typeof en.team.roles]}
              </SelectOption>
            ))}
          </FormSelect>
        </label>
        <label>
          {en.admin.teams}
          <FormSelect name="teamId">
            <SelectOption value="">{en.collaboration.none}</SelectOption>
            {w.teams.map((t) => (
              <SelectOption key={t.id} value={t.id}>
                {t.name}
              </SelectOption>
            ))}
          </FormSelect>
        </label>
        <Button disabled={busy}>{en.account.invite}</Button>
      </form>
      {items
        .filter((i) => i.status === "pending")
        .map((i) => (
          <div className="restore-row" key={i.id}>
            <span>
              {i.email}
              <small>
                {en.account.expiry}{" "}
                {new Date(i.expiresAt).toLocaleDateString(locale, {
                  timeZone: timezone,
                })}
              </small>
            </span>
            <Button
              disabled={busy}
              variant="outline"
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await authClient.organization.cancelInvitation({
                    invitationId: i.id,
                  });
                  if (r.error) throw Error();
                  await refresh();
                } catch {
                  setMessage(en.common.error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {en.account.cancel}
            </Button>
          </div>
        ))}
      <p role="status">{message}</p>
    </section>
  );
}
