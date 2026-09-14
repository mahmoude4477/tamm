"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import type { Workspace, Task } from "@/lib/types";
import { can } from "@/lib/permissions";
import { useMessages, useDates } from "@/components/locale-provider";
export function TransferPanel({ w, task }: { w: Workspace; task?: Task }) {
  const en = useMessages();

  const [items, setItems] = useState<
      {
        id: string;
        taskId: string;
        toId: string;
        requestedBy: string;
        reason: string;
      }[]
    >([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  const url = `/api/transfers?workspaceId=${encodeURIComponent(w.id)}`;
  async function refresh() {
    const r = await fetch(url);
    if (!r.ok) throw Error();
    setItems((await r.json()).items);
  }
  useEffect(() => {
    refresh().catch(() => setMessage(en.common.error));
  }, [url]);
  async function send(body: object) {
    setBusy(true);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Error();
      await refresh();
      setMessage(en.account.saved);
    } catch {
      setMessage(en.common.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detail-section">
      <h3>{en.views.transferRequests}</h3>
      {task &&
        task.assigneeId === actor.id &&
        w.settings?.transferPolicy === "approval" && (
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              send({
                type: "request",
                taskId: task.id,
                toId: String(f.get("toId")),
                reason: String(f.get("reason")),
              });
            }}
          >
            <label>
              {en.tasks.assignee}
              <select name="toId" required>
                {w.members
                  .filter((m) => m.id !== actor.id && m.active !== false)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {en.views.reason}
              <input name="reason" required maxLength={2000} />
            </label>
            <Button disabled={busy}>{en.views.transfer}</Button>
          </form>
        )}
      {items
        .filter((r) => !task || r.taskId === task.id)
        .map((r) => (
          <article className="comment" key={r.id}>
            <strong>{w.tasks.find((t) => t.id === r.taskId)?.title}</strong>
            <p>
              {w.members.find((m) => m.id === r.requestedBy)?.name} →{" "}
              {w.members.find((m) => m.id === r.toId)?.name}
            </p>
            <p>{r.reason}</p>
            {can(actor.role, "task.assign", actor.permissions) && (
              <div className="detail-actions">
                <Button
                  disabled={busy}
                  onClick={() =>
                    send({ type: "review", id: r.id, approve: true })
                  }
                >
                  {en.views.approve}
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    send({ type: "review", id: r.id, approve: false })
                  }
                >
                  {en.views.reject}
                </Button>
              </div>
            )}
          </article>
        ))}
      <p role="status">{message}</p>
    </section>
  );
}
export function TemplatePanel({ w }: { w: Workspace }) {
  const en = useMessages();

  const [items, setItems] = useState<
      { id: string; name: string; data: { kind: "task" | "project" } }[]
    >([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  const url = `/api/templates?workspaceId=${encodeURIComponent(w.id)}`;
  async function refresh() {
    const r = await fetch(url);
    if (!r.ok) throw Error();
    setItems((await r.json()).items);
  }
  useEffect(() => {
    refresh().catch(() => setMessage(en.common.error));
  }, [url]);
  async function send(body: object) {
    setBusy(true);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Error();
      const data = await r.json();
      if (data.workspace) window.location.reload();
      else await refresh();
      setMessage(en.account.saved);
    } catch {
      setMessage(en.common.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>{en.views.templates}</h2>
      {can(actor.role, "project.manage", actor.permissions) && (
        <form
          className="editor-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const [kind, id] = String(f.get("source")).split(":");
            send({
              type: "save",
              name: String(f.get("name")),
              ...(kind === "task" ? { taskId: id } : { projectId: id }),
            });
          }}
        >
          <label>
            {en.views.templateName}
            <input name="name" required maxLength={100} />
          </label>
          <label>
            {en.views.templates}
            <select name="source" required>
              {w.projects
                .filter((p) => !p.deletedAt && p.visibility === "organization")
                .map((p) => (
                  <option key={p.id} value={`project:${p.id}`}>
                    {en.admin.project}: {p.name}
                  </option>
                ))}
              {w.tasks
                .filter(
                  (t) =>
                    !t.deletedAt &&
                    w.projects.some(
                      (p) =>
                        p.id === t.projectId &&
                        p.visibility === "organization" &&
                        !p.deletedAt,
                    ),
                )
                .map((t) => (
                  <option key={t.id} value={`task:${t.id}`}>
                    {t.title}
                  </option>
                ))}
            </select>
          </label>
          <Button disabled={busy}>{en.views.saveTemplate}</Button>
        </form>
      )}
      {items.map((t) => (
        <details key={t.id}>
          <summary>{t.name}</summary>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              send({
                type: "apply",
                id: t.id,
                ...(t.data.kind === "task"
                  ? { projectId: String(f.get("projectId")) }
                  : {
                      name: String(f.get("name")),
                      code: String(f.get("code")),
                    }),
              });
            }}
          >
            {t.data.kind === "task" ? (
              <label>
                {en.admin.project}
                <select name="projectId" required>
                  {w.projects
                    .filter((p) => !p.deletedAt && !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  {en.admin.name}
                  <input name="name" defaultValue={t.name} required />
                </label>
                <label>
                  {en.projects.code}
                  <input name="code" pattern="[A-Z][A-Z0-9]{1,7}" required />
                </label>
              </>
            )}
            <Button disabled={busy}>{en.views.useTemplate}</Button>
          </form>
          {can(actor.role, "project.manage", actor.permissions) && (
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => {
                if (window.confirm(en.common.confirmDelete))
                  send({ type: "delete", id: t.id });
              }}
            >
              {en.common.delete}
            </Button>
          )}
        </details>
      ))}
      <p role="status">{message}</p>
    </section>
  );
}
