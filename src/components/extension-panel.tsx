"use client";
import { taskLabel } from "@/lib/task-label";
import { readRequest } from "@/lib/read-request";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect, SelectOption } from "@/components/ui/form-select";

import { useEffect, useState } from "react";
import type { Workspace } from "@/lib/types";
import type {
  customFields,
  customValues,
  timeEntries,
  integrationKeys,
  webhookEndpoints,
  webhookDeliveries,
} from "@/db/schema";
import { fieldKinds } from "@/lib/v2/model";
import { can, canEditTask } from "@/lib/permissions";
import { useMessages, useLocale } from "./locale-provider";
import { Button } from "./ui/button";
type Data = {
  fields: (typeof customFields.$inferSelect)[];
  values: (typeof customValues.$inferSelect)[];
  entries: (Omit<
    typeof timeEntries.$inferSelect,
    "startedAt" | "endedAt" | "deletedAt"
  > & {
    startedAt: string;
    endedAt: string | null;
    deletedAt: string | null;
  })[];
  totals: { taskId: string; userId: string; minutes: number }[];
  keys: Omit<typeof integrationKeys.$inferSelect, "hash">[];
  hooks: Omit<typeof webhookEndpoints.$inferSelect, "encryptedSecret">[];
  deliveries: (typeof webhookDeliveries.$inferSelect)[];
  aiEnabled: boolean;
};
const isoDay = () => new Date().toISOString().slice(0, 10);
export function ExtensionPanel({
  w,
  demo,
  taskId: fixedTask,
}: {
  w: Workspace;
  demo: boolean;
  taskId?: string;
}) {
  const en = useMessages(),
    p = en.v2,
    { locale } = useLocale(),
    actor = w.members.find((m) => m.id === w.currentUserId)!;
  const admin = can(actor.role, "user.manage", actor.permissions),
    manage = can(actor.role, "project.manage", actor.permissions),
    report = can(actor.role, "report.view", actor.permissions);
  const [fieldKind, setFieldKind] = useState<string>("text");
  const [tab, setTab] = useState<
      "fields" | "time" | "integrations" | "assistant"
    >("fields"),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [taskId, setTask] = useState(fixedTask || ""),
    [range, setRange] = useState({
      from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      to: isoDay(),
    }),
    [editField, setEditField] = useState<Data["fields"][number] | null>(null),
    [secret, setSecret] = useState<{ value: string; calendar: boolean } | null>(
      null,
    ),
    [result, setResult] = useState(""),
    [timeEdit, setTimeEdit] = useState<Data["entries"][number] | null>(null);
  const tasks = w.tasks.filter((t) => !t.deletedAt && !t.archived),
    task = tasks.find((t) => t.id === taskId),
    editable = !!task && canEditTask(w, task);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setError("");
    readRequest(
      `/api/extensions?${new URLSearchParams({ workspaceId: w.id, ...range })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw Error();
        setData(await r.json());
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(en.common.error);
      });
    return () => controller.abort();
  }, [w.id, demo, revision, range]);
  async function command(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(
        `/api/extensions?workspaceId=${encodeURIComponent(w.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const value = await r.json();
      if (!r.ok) throw Error(value.error);
      if (value.secret)
        setSecret({
          value: value.secret,
          calendar:
            body.type === "key.create" &&
            (body.scopes as string[]).includes("calendar:read"),
        });
      setRevision((x) => x + 1);
      setNotice(p.saved);
      return true;
    } catch {
      setError(en.common.error);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function projects(all = false) {
    return (
      <>
        {all && <SelectOption value="">{p.allProjects}</SelectOption>}
        {w.projects
          .filter((p) => !p.archived && !p.deletedAt)
          .map((pr) => (
            <SelectOption key={pr.id} value={pr.id}>
              {pr.name}
            </SelectOption>
          ))}
      </>
    );
  }
  function exportTime() {
    if (!data) return;
    const rows = [
      [p.project, p.task, p.user, p.hours, p.estimated],
      ...data.totals.map((r) => {
        const t = w.tasks.find((t) => t.id === r.taskId);
        return [
          w.projects.find((p) => p.id === t?.projectId)?.name || "",
          t?.title || "",
          w.members.find((m) => m.id === r.userId)?.name || "",
          String(Math.round((r.minutes / 60) * 100) / 100),
          String(t?.estimatedHours || 0),
        ];
      }),
    ];
    const csv = rows
        .map((row) =>
          row
            .map(
              (v) =>
                '"' +
                (/^[=+\-@\t\r]/.test(v) ? "'" : "") +
                v.replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\r\n"),
      url = URL.createObjectURL(
        new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "tamm-time.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selectedFields =
    data?.fields.filter(
      (f) => !f.archived && (!f.projectId || f.projectId === task?.projectId),
    ) || [];
  return (
    <section className="planning-panel extension-panel" aria-label={p.title}>
      {!fixedTask && <h1>{p.title}</h1>}
      {demo ? (
        <p>{p.demo}</p>
      ) : (
        <>
          <div className="planning-tabs">
            {(
              [
                "fields",
                "time",
                ...(!fixedTask ? ["integrations", "assistant"] : []),
              ] as (typeof tab)[]
            ).map((t) => (
              <Button
                type="button"
                key={t}
                variant="ghost"
                aria-pressed={tab === t}
                onClick={() => {
                  setTab(t);
                  setSecret(null);
                  setError("");
                  setNotice("");
                }}
              >
                {p[t]}
              </Button>
            ))}
          </div>
          {["fields", "time"].includes(tab) && !fixedTask && (
            <label>
              {p.task}
              <FormSelect
                aria-label={p.task}
                value={taskId}
                onValueChange={(value) => setTask(value)}
              >
                <SelectOption value="">{p.selectTask}</SelectOption>
                {tasks.map((t) => (
                  <SelectOption key={t.id} value={t.id}>
                    {taskLabel(w, t)}
                  </SelectOption>
                ))}
              </FormSelect>
            </label>
          )}
          {tab === "fields" && (
            <>
              {task && (
                <div className="planning-card">
                  <h2>{p.fields}</h2>
                  {selectedFields.length === 0 && <p>{p.empty}</p>}
                  {selectedFields.map((f) => (
                    <FieldValue
                      key={`${f.id}-${taskId}-${revision}`}
                      field={f}
                      value={
                        data?.values.find(
                          (v) => v.taskId === taskId && v.fieldId === f.id,
                        )?.value ?? null
                      }
                      members={w.members}
                      disabled={!editable || busy}
                      onSave={(value) =>
                        command({
                          type: "field.value",
                          taskId,
                          fieldId: f.id,
                          value,
                        })
                      }
                    />
                  ))}
                </div>
              )}
              {!fixedTask && manage && (
                <>
                  <p>{p.fieldHint}</p>
                  <form
                    className="planning-card"
                    key={editField?.id || "new-field"}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        await command({
                          type: "field.save",
                          id: editField?.id,
                          name: f.get("name"),
                          kind: editField?.kind || f.get("kind"),
                          projectId: editField
                            ? editField.projectId
                            : f.get("project") || null,
                          options: String(f.get("options") || "")
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                          archived: editField?.archived || false,
                        })
                      )
                        setEditField(null);
                    }}
                  >
                    <h2>{editField ? p.edit : p.create}</h2>
                    <label>
                      {p.name}
                      <Input
                        name="name"
                        required
                        maxLength={100}
                        defaultValue={editField?.name}
                      />
                    </label>
                    <label>
                      {p.kind}
                      <FormSelect
                        name="kind"
                        disabled={!!editField}
                        onValueChange={(value) => setFieldKind(value)}
                        aria-label={p.kind}
                        defaultValue={editField?.kind || "text"}
                      >
                        {fieldKinds.map((k) => (
                          <SelectOption key={k} value={k}>
                            {p[k]}
                          </SelectOption>
                        ))}
                      </FormSelect>
                    </label>
                    <label>
                      {p.project}
                      <FormSelect
                        name="project"
                        aria-label={p.project}
                        disabled={!!editField}
                        defaultValue={editField?.projectId || ""}
                      >
                        {projects(true)}
                      </FormSelect>
                    </label>
                    <label hidden={fieldKind !== "dropdown"}>
                      {p.options}
                      <Textarea
                        name="options"
                        defaultValue={editField?.options.join("\n")}
                      />
                    </label>
                    <Button disabled={busy}>{p.save}</Button>
                    {editField && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEditField(null);
                          setFieldKind("text");
                        }}
                      >
                        {p.cancel}
                      </Button>
                    )}
                  </form>
                  <div className="planning-grid">
                    {data?.fields.map((f) => (
                      <article key={f.id} className="planning-card">
                        <h3>{f.name}</h3>
                        <p>
                          {p[f.kind as (typeof fieldKinds)[number]]} ·{" "}
                          {f.projectId
                            ? w.projects.find((p) => p.id === f.projectId)?.name
                            : p.allProjects}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditField(f);
                            setFieldKind(f.kind);
                          }}
                        >
                          {p.edit}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            command({
                              type: "field.save",
                              ...f,
                              archived: !f.archived,
                            })
                          }
                        >
                          {f.archived ? p.restore : p.archive}
                        </Button>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {tab === "time" && (
            <>
              <p>{p.timeHint}</p>
              {data?.entries
                .filter((e) => !e.endedAt && e.userId === actor.id)
                .map((e) => (
                  <div className="planning-card" key={e.id}>
                    <strong>
                      {p.running}:{" "}
                      {w.tasks.find((t) => t.id === e.taskId)?.title}
                    </strong>
                    <p>{new Date(e.startedAt).toLocaleString(locale)}</p>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => command({ type: "time.stop", id: e.id })}
                    >
                      {p.stop}
                    </Button>
                  </div>
                ))}
              {editable && (
                <>
                  <Button
                    type="button"
                    disabled={
                      busy ||
                      !!data?.entries.some(
                        (e) => !e.endedAt && e.userId === actor.id,
                      )
                    }
                    onClick={() => command({ type: "time.start", taskId })}
                  >
                    {p.start}
                  </Button>
                  <form
                    className="planning-card"
                    key={timeEdit?.id || taskId}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        await command({
                          type: "time.save",
                          id: timeEdit?.id,
                          taskId: timeEdit?.taskId || taskId,
                          startedAt: new Date(
                            String(f.get("startedAt")),
                          ).toISOString(),
                          minutes: Number(f.get("minutes")),
                          note: f.get("note"),
                        })
                      )
                        setTimeEdit(null);
                    }}
                  >
                    <h2>{timeEdit ? p.edit : p.manual}</h2>
                    <label>
                      {p.startedAt}
                      <Input
                        required
                        name="startedAt"
                        type="datetime-local"
                        defaultValue={
                          timeEdit
                            ? localDate(timeEdit.startedAt)
                            : localDate(
                                new Date(Date.now() - 3600000).toISOString(),
                              )
                        }
                      />
                    </label>
                    <label>
                      {p.minutes}
                      <Input
                        required
                        name="minutes"
                        type="number"
                        min={1}
                        max={1440}
                        defaultValue={timeEdit?.minutes || 60}
                      />
                    </label>
                    <label>
                      {p.note}
                      <Input
                        name="note"
                        maxLength={2000}
                        defaultValue={timeEdit?.note}
                      />
                    </label>
                    <Button disabled={busy}>{p.save}</Button>
                    {timeEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setTimeEdit(null)}
                      >
                        {p.cancel}
                      </Button>
                    )}
                  </form>
                </>
              )}
              {!fixedTask && (
                <form
                  className="analytics-filters"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setRange({
                      from: String(f.get("from")),
                      to: String(f.get("to")),
                    });
                  }}
                >
                  <label>
                    {p.from}
                    <Input
                      name="from"
                      type="date"
                      required
                      defaultValue={range.from}
                    />
                  </label>
                  <label>
                    {p.to}
                    <Input
                      name="to"
                      type="date"
                      required
                      defaultValue={range.to}
                    />
                  </label>
                  <Button>{p.apply}</Button>
                </form>
              )}
              <p>{p.entriesHint}</p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{p.task}</th>
                      <th>{p.user}</th>
                      <th>{p.startedAt}</th>
                      <th>{p.minutes}</th>
                      <th>{p.note}</th>
                      <th>{p.edit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.entries
                      .filter((e) => !fixedTask || e.taskId === fixedTask)
                      .map((e) => (
                        <tr key={e.id}>
                          <td>
                            {w.tasks.find((t) => t.id === e.taskId)?.title}
                          </td>
                          <td>
                            {w.members.find((m) => m.id === e.userId)?.name}
                          </td>
                          <td>
                            {new Date(e.startedAt).toLocaleString(locale)}
                          </td>
                          <td>{e.minutes === null ? p.running : e.minutes}</td>
                          <td>{e.note}</td>
                          <td>
                            {e.userId === actor.id && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={busy || !e.endedAt}
                                  onClick={() => {
                                    setTask(e.taskId);
                                    setTimeEdit(e);
                                  }}
                                >
                                  {p.edit}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    command({ type: "time.delete", id: e.id })
                                  }
                                >
                                  {p.delete}
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!fixedTask && (
                <>
                  <h2>{p.report}</h2>
                  <Button type="button" onClick={exportTime}>
                    {p.export}
                  </Button>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{p.project}</th>
                          <th>{p.task}</th>
                          <th>{p.user}</th>
                          <th>{p.hours}</th>
                          <th>{p.estimated}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.totals.map((r) => {
                          const t = w.tasks.find((t) => t.id === r.taskId);
                          return (
                            <tr key={`${r.taskId}-${r.userId}`}>
                              <td>
                                {
                                  w.projects.find((p) => p.id === t?.projectId)
                                    ?.name
                                }
                              </td>
                              <td>{t?.title}</td>
                              <td>
                                {w.members.find((m) => m.id === r.userId)?.name}
                              </td>
                              <td>
                                {(r.minutes / 60).toLocaleString(locale, {
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td>{t?.estimatedHours}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
          {tab === "integrations" && (
            <>
              <h2>{p.keys}</h2>
              <p>{p.integrationHint}</p>
              <a
                className="planning-link"
                href={`/api/calendar?workspaceId=${encodeURIComponent(w.id)}`}
              >
                {p.downloadCalendar}
              </a>
              <form
                className="planning-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget),
                    scope = String(f.get("scope"));
                  command({
                    type: "key.create",
                    name: f.get("name"),
                    projectId: f.get("project") || null,
                    days: Number(f.get("days")),
                    scopes:
                      scope === "write"
                        ? ["tasks:read", "tasks:write"]
                        : scope === "read"
                          ? ["tasks:read"]
                          : ["calendar:read"],
                  });
                }}
              >
                <label>
                  {p.name}
                  <Input name="name" required maxLength={100} />
                </label>
                <label>
                  {p.project}
                  <FormSelect name="project" aria-label={p.project}>
                    {projects(true)}
                  </FormSelect>
                </label>
                <label>
                  {p.scope}
                  <FormSelect name="scope" aria-label={p.scope}>
                    <SelectOption value="calendar">
                      {p.calendarOnly}
                    </SelectOption>
                    {admin && (
                      <>
                        <SelectOption value="read">{p.readOnly}</SelectOption>
                        <SelectOption value="write">{p.readWrite}</SelectOption>
                      </>
                    )}
                  </FormSelect>
                </label>
                <label>
                  {p.days}
                  <Input
                    name="days"
                    type="number"
                    min={1}
                    max={365}
                    defaultValue={90}
                    required
                  />
                </label>
                <Button disabled={busy}>{p.create}</Button>
              </form>
              {secret && (
                <div className="planning-card" role="status">
                  <p>{p.secretHint}</p>
                  <label>
                    {secret.calendar ? p.calendarUrl : p.secret}
                    <Input
                      readOnly
                      value={
                        secret.calendar
                          ? `${location.origin}/api/calendar?token=${secret.value}`
                          : secret.value
                      }
                    />
                  </label>
                  <Button type="button" onClick={() => setSecret(null)}>
                    {en.common.close}
                  </Button>
                </div>
              )}
              <div className="planning-grid">
                {data?.keys.map((k) => (
                  <article className="planning-card" key={k.id}>
                    <h3>{k.name}</h3>
                    <p>
                      {p.expires}:{" "}
                      {new Date(k.expiresAt).toLocaleDateString(locale)}
                    </p>
                    <p>{k.scopes.join(", ")}</p>
                    {k.revokedAt ? (
                      <p>{p.revoked}</p>
                    ) : (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          command({ type: "key.revoke", id: k.id })
                        }
                      >
                        {p.revoke}
                      </Button>
                    )}
                  </article>
                ))}
              </div>
              {admin && (
                <>
                  <h2>{p.hooks}</h2>
                  <p>{p.hookHint}</p>
                  <form
                    className="planning-card"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      command({
                        type: "hook.create",
                        name: f.get("name"),
                        projectId: f.get("project"),
                        url: f.get("url"),
                      });
                    }}
                  >
                    <label>
                      {p.name}
                      <Input name="name" required maxLength={100} />
                    </label>
                    <label>
                      {p.project}
                      <FormSelect name="project" aria-label={p.project}>
                        {projects()}
                      </FormSelect>
                    </label>
                    <label>
                      {p.url}
                      <Input name="url" type="url" required maxLength={2000} />
                    </label>
                    <Button disabled={busy}>{p.create}</Button>
                  </form>
                  <div className="planning-grid">
                    {data?.hooks.map((h) => (
                      <article key={h.id} className="planning-card">
                        <h3>{h.name}</h3>
                        <p>{h.url}</p>
                        <p>{h.enabled ? p.enabled : p.paused}</p>
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            command({
                              type: "hook.toggle",
                              id: h.id,
                              enabled: !h.enabled,
                            })
                          }
                        >
                          {h.enabled ? p.pause : p.resume}
                        </Button>
                      </article>
                    ))}
                  </div>
                  <h3>{p.deliveries}</h3>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{p.name}</th>
                          <th>{p.attempts}</th>
                          <th>{p.status}</th>
                          <th>{p.retry}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.deliveries.map((d) => (
                          <tr key={d.id}>
                            <td>
                              {
                                data.hooks.find((h) => h.id === d.endpointId)
                                  ?.name
                              }
                            </td>
                            <td>{d.attempts}</td>
                            <td>
                              {d.deliveredAt ? p.delivered : p.pending}{" "}
                              {d.lastStatus || ""}
                            </td>
                            <td>
                              {!d.deliveredAt && (
                                <Button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    command({ type: "hook.retry", id: d.id })
                                  }
                                >
                                  {p.retry}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
          {tab === "assistant" && (
            <>
              <h2>{p.assistant}</h2>
              {!data?.aiEnabled ? (
                <p>{p.aiDisabled}</p>
              ) : (
                <>
                  <p>{p.aiHint}</p>
                  <form
                    className="planning-card"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      setBusy(true);
                      setError("");
                      setResult("");
                      try {
                        const r = await fetch(
                          `/api/assistant?workspaceId=${encodeURIComponent(w.id)}`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              projectId: f.get("project"),
                              mode: f.get("mode"),
                              prompt: f.get("prompt"),
                              locale,
                            }),
                          },
                        );
                        const d = await r.json();
                        if (!r.ok) {
                          setError(
                            r.status === 429 ? p.limit : en.common.error,
                          );
                          return;
                        }
                        setResult(d.text);
                      } catch {
                        setError(en.common.error);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label>
                      {p.project}
                      <FormSelect name="project" aria-label={p.project}>
                        {projects()}
                      </FormSelect>
                    </label>
                    <label>
                      {p.mode}
                      <FormSelect name="mode" aria-label={p.mode}>
                        {(["draft", "summary", "plan"] as const).map((m) => (
                          <SelectOption key={m} value={m}>
                            {p[m]}
                          </SelectOption>
                        ))}
                      </FormSelect>
                    </label>
                    <label>
                      {p.prompt}
                      <Textarea name="prompt" required maxLength={4000} />
                    </label>
                    <label className="extension-checkbox">
                      <Checkbox required />
                      {p.aiConsent}
                    </label>
                    <Button
                      disabled={
                        busy ||
                        !can(actor.role, "task.create", actor.permissions)
                      }
                    >
                      {p.generate}
                    </Button>
                  </form>
                  {result && (
                    <div className="planning-card">
                      <label>
                        {p.result}
                        <Textarea
                          value={result}
                          onChange={(e) => setResult(e.target.value)}
                          rows={14}
                        />
                      </label>
                      <Button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(result);
                            setNotice(p.copied);
                          } catch {
                            setError(en.common.error);
                          }
                        }}
                      >
                        {p.copy}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <p role="status">{busy ? en.common.loading : notice}</p>
          <p role="alert">{error}</p>
        </>
      )}
    </section>
  );
}
function localDate(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function FieldValue({
  field,
  value,
  members,
  disabled,
  onSave,
}: {
  field: Data["fields"][number];
  value: unknown;
  members: Workspace["members"];
  disabled: boolean;
  onSave: (value: string | number | boolean | null) => Promise<boolean>;
}) {
  const p = useMessages().v2;
  const [input, setInput] = useState<string | boolean>(
    field.kind === "checkbox" ? value === true : String(value ?? ""),
  );
  return (
    <form
      className="extension-field"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(
          input === "" && field.kind !== "text"
            ? null
            : field.kind === "number"
              ? Number(input)
              : input,
        );
      }}
    >
      <label>
        {field.name}
        {field.kind === "checkbox" ? (
          <Checkbox
            disabled={disabled}
            checked={input === true}
            onCheckedChange={(checked) => setInput(checked)}
          />
        ) : field.kind === "dropdown" || field.kind === "user" ? (
          <FormSelect
            disabled={disabled}
            aria-label={field.name}
            value={String(input)}
            onValueChange={(value) => setInput(value)}
          >
            <SelectOption value="">{p.none}</SelectOption>
            {field.kind === "dropdown"
              ? field.options.map((o) => (
                  <SelectOption key={o}>{o}</SelectOption>
                ))
              : members
                  .filter((m) => m.active !== false)
                  .map((m) => (
                    <SelectOption key={m.id} value={m.id}>
                      {m.name}
                    </SelectOption>
                  ))}
          </FormSelect>
        ) : (
          <Input
            disabled={disabled}
            type={
              field.kind === "number"
                ? "number"
                : field.kind === "date"
                  ? "date"
                  : "text"
            }
            step="any"
            maxLength={4000}
            value={String(input)}
            onChange={(e) => setInput(e.target.value)}
          />
        )}
      </label>
      <Button disabled={disabled}>{p.save}</Button>
      <Button
        type="button"
        disabled={disabled}
        variant="ghost"
        onClick={() => onSave(null)}
      >
        {p.clear}
      </Button>
    </form>
  );
}
