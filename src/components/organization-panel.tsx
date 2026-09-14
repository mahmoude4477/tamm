"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import type { Workspace } from "@/lib/types";
import { useMessages, useDates } from "@/components/locale-provider";
export function WorkspaceSwitcher({ w }: { w: Workspace }) {
  const en = useMessages();

  const [items, setItems] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    authClient.organization
      .list()
      .then((r) => {
        if (r.data) setItems(r.data);
        else setError(en.common.error);
      })
      .catch(() => setError(en.common.error));
  }, [w.id]);
  return (
    <div className="workspace-switcher">
      <label>
        {en.account.workspace}
        <select
          value={w.id}
          onChange={async (e) => {
            const r = await authClient.organization.setActive({
              organizationId: e.target.value,
            });
            if (r.error) setError(en.common.error);
            else window.location.assign("/workspace");
          }}
        >
          {items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
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
            <input name="name" required maxLength={100} />
          </label>
          <Button>{en.account.createWorkspace}</Button>
        </form>
      </details>
      <p role="alert">{error}</p>
    </div>
  );
}
export function InvitationPanel({ w }: { w: Workspace }) {
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
          <input name="email" type="email" required />
        </label>
        <label>
          {en.account.role}
          <select name="role">
            {["member", "viewer", "manager", "admin"].map((role) => (
              <option key={role} value={role}>
                {en.team.roles[role as keyof typeof en.team.roles]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {en.admin.teams}
          <select name="teamId">
            <option value="">{en.collaboration.none}</option>
            {w.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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
                {new Date(i.expiresAt).toLocaleDateString("en")}
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
