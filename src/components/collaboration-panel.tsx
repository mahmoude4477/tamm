"use client";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { Workspace, Task, Attachment, Notification } from "@/lib/types";
import type { Send } from "./task-editor";
import { can } from "@/lib/permissions";
import { useMessages, useDates } from "@/components/locale-provider";
export function FilePanel({
  w,
  taskId,
  projectId,
  demo = false,
}: {
  w: Workspace;
  taskId?: string;
  projectId?: string;
  demo?: boolean;
}) {
  const en = useMessages();

  const [files, setFiles] = useState<Attachment[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  const query = new URLSearchParams({
    workspaceId: w.id,
    ...(taskId ? { taskId } : { projectId: projectId ?? "" }),
  });
  const url = `/api/files?${query}`;
  async function refresh() {
    const r = await fetch(url);
    if (!r.ok) throw Error();
    setFiles((await r.json()).items);
  }
  useEffect(() => {
    if (!demo) refresh().catch(() => setError(en.common.error));
  }, [url, demo]);
  return (
    <section className="detail-section">
      <h3>{en.collaboration.files}</h3>
      {demo ? (
        <p className="muted">{en.collaboration.demoFiles}</p>
      ) : (
        <>
          <p className="muted">{en.collaboration.fileHint}</p>
          {actor.role !== "viewer" && (
            <form
              className="editor-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                if (taskId) f.set("taskId", taskId);
                if (projectId) f.set("projectId", projectId);
                setBusy(true);
                setError("");
                try {
                  const r = await fetch(url, { method: "POST", body: f });
                  if (!r.ok) throw Error();
                  await refresh();
                  form.reset();
                } catch {
                  setError(en.errors.file);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {en.collaboration.upload}
                <input
                  name="file"
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,.txt,.csv"
                  required
                />
              </label>
              <Button disabled={busy}>{en.collaboration.upload}</Button>
            </form>
          )}
          {files.map((file) => (
            <div className="file-row" key={file.id}>
              <span>
                {file.name}
                <small>
                  {Math.ceil(file.size / 1024)} {en.common.kilobytes}
                </small>
              </span>
              <a href={`${url}&id=${encodeURIComponent(file.id)}`}>
                {en.collaboration.download}
              </a>
              {file.mime.startsWith("image/") && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`${url}&id=${encodeURIComponent(file.id)}&preview=true`}
                >
                  {en.collaboration.preview}
                </a>
              )}
              {(file.uploadedBy === actor.id ||
                can(actor.role, "task.delete", actor.permissions)) && (
                <Button
                  disabled={busy}
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!window.confirm(en.common.confirmDelete)) return;
                    setBusy(true);
                    try {
                      const r = await fetch(
                        `${url}&id=${encodeURIComponent(file.id)}`,
                        { method: "DELETE" },
                      );
                      if (!r.ok) throw Error();
                      await refresh();
                    } catch {
                      setError(en.common.error);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {en.collaboration.remove}
                </Button>
              )}
            </div>
          ))}
        </>
      )}
      <p role="alert">{error}</p>
    </section>
  );
}
export function CommentPanel({
  w,
  task,
  send,
  busy,
}: {
  w: Workspace;
  task: Task;
  send: Send;
  busy: boolean;
}) {
  const en = useMessages();

  const [reply, setReply] = useState<string | null>(null),
    [edit, setEdit] = useState<string | null>(null);
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  const comments = w.events.filter(
    (e) => e.taskId === task.id && e.action === "task.commented",
  );
  return (
    <section className="detail-section">
      <h3>{en.tasks.comments}</h3>
      {actor.role !== "viewer" && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            send({
              type: "task.follow",
              id: task.id,
              following: !task.watcherIds?.includes(actor.id),
            })
          }
        >
          {task.watcherIds?.includes(actor.id)
            ? en.collaboration.unfollow
            : en.collaboration.follow}
        </Button>
      )}
      {comments.map((c) => (
        <article className="comment" key={c.id}>
          <strong>{w.members.find((m) => m.id === c.actorId)?.name}</strong>{" "}
          <time>{new Date(c.createdAt).toLocaleString("en")}</time>
          {c.parentEventId && (
            <blockquote>
              {comments.find((p) => p.id === c.parentEventId)?.deletedAt
                ? en.collaboration.deleted
                : comments.find((p) => p.id === c.parentEventId)?.text}
            </blockquote>
          )}
          {edit === c.id ? (
            <form
              className="editor-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await send({
                    type: "comment.edit",
                    id: c.id,
                    text: String(new FormData(e.currentTarget).get("text")),
                  })
                )
                  setEdit(null);
              }}
            >
              <textarea
                name="text"
                aria-label={en.collaboration.edit}
                defaultValue={c.text}
                required
                maxLength={10000}
              />
              <Button disabled={busy}>{en.common.save}</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEdit(null)}
              >
                {en.collaboration.cancel}
              </Button>
            </form>
          ) : (
            <div className="markdown">
              <Markdown skipHtml>
                {c.deletedAt ? en.collaboration.deleted : c.text}
              </Markdown>
            </div>
          )}
          {c.editedAt && <small>{en.collaboration.edited}</small>}
          {!c.deletedAt && actor.role !== "viewer" && (
            <div className="detail-actions">
              <Button size="sm" variant="ghost" onClick={() => setReply(c.id)}>
                {en.collaboration.reply}
              </Button>
              {(c.actorId === actor.id ||
                can(actor.role, "user.manage", actor.permissions)) && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEdit(c.id)}
                  >
                    {en.collaboration.edit}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(en.common.confirmDelete))
                        send({ type: "comment.delete", id: c.id });
                    }}
                  >
                    {en.collaboration.delete}
                  </Button>
                </>
              )}
            </div>
          )}
        </article>
      ))}
      {actor.role !== "viewer" && (
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            if (
              await send({
                type: "task.comment",
                id: task.id,
                text: String(f.get("text")),
                parentEventId: reply,
                mentionedIds: f.getAll("mentions").map(String),
              })
            ) {
              form.reset();
              setReply(null);
            }
          }}
        >
          {reply && (
            <p>
              {en.collaboration.replyTo}{" "}
              {
                w.members.find(
                  (m) => m.id === comments.find((c) => c.id === reply)?.actorId,
                )?.name
              }
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setReply(null)}
              >
                {en.collaboration.cancel}
              </Button>
            </p>
          )}
          <label>
            {en.tasks.comments}
            <textarea
              name="text"
              required
              maxLength={10000}
              placeholder={en.tasks.commentPlaceholder}
            />
          </label>
          <small>{en.collaboration.markdown}</small>
          <label>
            {en.collaboration.mentions}
            <select multiple name="mentions">
              {w.members
                .filter((m) => m.active !== false && m.id !== actor.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <Button disabled={busy}>{en.tasks.post}</Button>
        </form>
      )}
    </section>
  );
}
const kinds = [
  "assignment",
  "comment",
  "mention",
  "review",
  "status",
  "due",
  "overdue",
] as const;
export function Inbox({
  w,
  onTask,
}: {
  w: Workspace;
  onTask: (id: string) => void;
}) {
  const en = useMessages();

  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Notification[]>([]),
    [enabled, setEnabled] = useState<string[]>([...kinds]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const url = `/api/notifications?workspaceId=${encodeURIComponent(w.id)}`;
  async function refresh() {
    const r = await fetch(url);
    if (!r.ok) throw Error();
    const data = await r.json();
    setItems(data.items);
    setEnabled(data.enabledKinds);
  }
  useEffect(() => {
    refresh().catch(() => setMessage(en.common.error));
  }, [url, open]);
  async function send(body: object) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Error();
      await refresh();
    } catch {
      setMessage(en.common.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {en.collaboration.inbox}
        {items.some((n) => !n.readAt) && (
          <span className="nav-count">
            {items.filter((n) => !n.readAt).length}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{en.collaboration.inbox}</DialogTitle>
          <DialogDescription>{en.collaboration.preferences}</DialogDescription>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => send({ type: "read" })}
          >
            {en.collaboration.markAll}
          </Button>
          {!items.length && <p>{en.collaboration.empty}</p>}
          {items.map((n) => (
            <article
              key={n.id}
              className={`comment ${n.readAt ? "muted" : ""}`}
            >
              <p>
                {en.collaboration[n.kind as (typeof kinds)[number]]} ·{" "}
                {n.actorName}
              </p>
              <button
                className="text-link"
                onClick={() => {
                  if (n.taskId) {
                    onTask(n.taskId);
                    setOpen(false);
                  }
                  send({ type: "read", ids: [n.id] });
                }}
              >
                {n.taskTitle}
              </button>
            </article>
          ))}
          <details>
            <summary>{en.collaboration.preferences}</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send({ type: "preferences", enabledKinds: enabled });
              }}
            >
              {kinds.map((kind) => (
                <label className="checklist-item" key={kind}>
                  <input
                    type="checkbox"
                    checked={enabled.includes(kind)}
                    onChange={(e) =>
                      setEnabled(
                        e.target.checked
                          ? [...enabled, kind]
                          : enabled.filter((k) => k !== kind),
                      )
                    }
                  />
                  {en.collaboration[kind]}
                </label>
              ))}
              <Button disabled={busy}>{en.collaboration.save}</Button>
            </form>
          </details>
          <p role="status">{message}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
