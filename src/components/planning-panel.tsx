"use client";
import { taskLabel } from "@/lib/task-label";
import { readRequest } from "@/lib/read-request";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSelect, SelectOption } from "@/components/ui/form-select";

import { useEffect, useState } from "react";
import type { Workspace } from "@/lib/types";
import { useDates, useLocale, useMessages } from "./locale-provider";
import { Button } from "./ui/button";
import { can } from "@/lib/permissions";
import { weekStart, type Schedule } from "@/lib/planning/model";
import type { capacityPlan } from "@/lib/planning/capacity";
type Milestone = {
  id: string;
  projectId: string;
  name: string;
  dueDate: string;
  taskIds: string[];
  total: number;
  completed: number;
  archived: boolean;
};
type Planning = {
  milestones: Milestone[];
  rules: {
    id: string;
    name: string;
    nextDate: string;
    enabled: boolean;
    lastError: string | null;
    schedule: Schedule;
    taskCount: number;
  }[];
  runs: {
    id: string;
    recurringId: string;
    scheduledFor: string;
    taskIds: string[];
  }[];
  capacity: ReturnType<typeof capacityPlan> | null;
};
export function PlanningPanel({
  w,
  demo,
  onTask,
}: {
  w: Workspace;
  demo: boolean;
  onTask: (id: string) => void;
}) {
  const en = useMessages(),
    p = en.planning,
    { today, formatDate } = useDates(),
    { timezone, locale } = useLocale();
  const [tab, setTab] = useState<"milestones" | "recurring" | "capacity">(
      "milestones",
    ),
    [week, setWeek] = useState(weekStart(today())),
    [data, setData] = useState<Planning | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<Milestone | null>(null),
    [project, setProject] = useState(
      w.projects.find((p) => !p.archived && !p.deletedAt)?.id ?? "",
    );
  const actor = w.members.find((m) => m.id === w.currentUserId)!,
    manage = can(actor.role, "project.manage", actor.permissions),
    create = can(actor.role, "task.create", actor.permissions),
    report = can(actor.role, "report.view", actor.permissions);
  const url = `/api/planning?workspaceId=${encodeURIComponent(w.id)}&week=${week}`;
  async function refresh() {
    if (demo) return;
    const r = await readRequest(url);
    if (!r.ok) throw Error();
    setData(await r.json());
  }
  useEffect(() => {
    setData(null);
    refresh().catch(() => setMessage(en.common.error));
  }, [url, demo]);
  async function send(body: object) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const error = await r.json();
        throw Error(
          en.errors[error.error as keyof typeof en.errors] ?? en.common.error,
        );
      }
      await refresh();
      setEditing(null);
      setMessage(p.saved);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : en.common.error);
    } finally {
      setBusy(false);
    }
  }
  const number = (v: number) =>
    v.toLocaleString(locale, { maximumFractionDigits: 1 });
  return (
    <section className="planning-panel">
      <div className="section-heading">
        <div>
          <h1>{p.planningTitle}</h1>
          <p>{p.planningSubtitle}</p>
        </div>
      </div>
      <div className="view-switch" aria-label={p.planningTitle}>
        {(
          ["milestones", "recurring", ...(report ? ["capacity"] : [])] as const
        ).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            aria-pressed={tab === t}
            onClick={() => setTab(t as typeof tab)}
          >
            {p[t as typeof tab]}
          </button>
        ))}
      </div>
      {demo ? (
        <p>{p.demoHint}</p>
      ) : (
        <>
          {tab === "milestones" && (
            <div className="planning-grid">
              <section>
                <h2>{p.milestones}</h2>
                {!data?.milestones.length && <p>{p.empty}</p>}
                {data?.milestones.map((m) => (
                  <article className="planning-card" key={m.id}>
                    <div className="section-heading">
                      <h3>{m.name}</h3>
                      {m.archived && <span>{p.archived}</span>}
                    </div>
                    <p>
                      {w.projects.find((x) => x.id === m.projectId)?.name} ·{" "}
                      {formatDate(m.dueDate)}
                    </p>
                    <progress
                      max={m.total || 1}
                      value={m.completed}
                      aria-label={p.progress}
                    />
                    <p>
                      {number(m.completed)} / {number(m.total)} {p.completed}
                    </p>
                    <div className="planning-actions">
                      {manage && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(m);
                              setProject(m.projectId);
                            }}
                          >
                            {p.edit}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              send({
                                type: "milestone.save",
                                ...m,
                                archived: !m.archived,
                              })
                            }
                          >
                            {m.archived ? p.restore : p.archive}
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </section>
              {manage && (
                <form
                  key={editing?.id ?? "new"}
                  className="editor-form planning-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    send({
                      type: "milestone.save",
                      id: editing?.id,
                      projectId: project,
                      name: String(f.get("name")),
                      dueDate: String(f.get("dueDate")),
                      taskIds: f.getAll("tasks"),
                      archived: editing?.archived ?? false,
                    });
                  }}
                >
                  <h2>{editing ? p.edit : p.create}</h2>
                  <label>
                    {p.name}
                    <Input
                      name="name"
                      required
                      maxLength={120}
                      defaultValue={editing?.name}
                    />
                  </label>
                  <label>
                    {p.project}
                    <FormSelect
                      aria-label={p.project}
                      value={project}
                      disabled={!!editing}
                      onValueChange={(value) => setProject(value)}
                    >
                      {w.projects
                        .filter((p) => !p.archived && !p.deletedAt)
                        .map((p) => (
                          <SelectOption key={p.id} value={p.id}>
                            {p.name}
                          </SelectOption>
                        ))}
                    </FormSelect>
                  </label>
                  <label>
                    {p.dueDate}
                    <Input
                      name="dueDate"
                      type="date"
                      required
                      defaultValue={editing?.dueDate ?? today()}
                    />
                  </label>
                  <label>
                    {p.tasks}
                    <FormSelect
                      aria-label={p.tasks}
                      multiple
                      name="tasks"
                      defaultValue={editing?.taskIds ?? []}
                    >
                      {w.tasks
                        .filter(
                          (t) =>
                            t.projectId === project &&
                            !t.deletedAt &&
                            !data?.milestones.some(
                              (m) =>
                                m.id !== editing?.id &&
                                m.taskIds.includes(t.id),
                            ),
                        )
                        .map((t) => (
                          <SelectOption key={t.id} value={t.id}>
                            {taskLabel(w, t)}
                          </SelectOption>
                        ))}
                    </FormSelect>
                  </label>
                  <Button disabled={busy || !project}>{p.save}</Button>
                  {editing && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      {p.cancel}
                    </Button>
                  )}
                </form>
              )}
            </div>
          )}
          {tab === "recurring" && (
            <div className="planning-grid">
              <section>
                <h2>{p.recurring}</h2>
                <p>{p.scheduleHint}</p>
                {!data?.rules.length && <p>{p.empty}</p>}
                {data?.rules.map((r) => (
                  <article className="planning-card" key={r.id}>
                    <h3>{r.name}</h3>
                    <p>
                      {p.nextDate}: {formatDate(r.nextDate)} ·{" "}
                      {p[r.schedule.frequency]} × {number(r.schedule.interval)}
                    </p>
                    <p>{r.enabled ? p.enabled : p.paused}</p>
                    {r.lastError && <p role="alert">{p.scheduleError}</p>}
                    {create && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          send({
                            type: "recurrence.toggle",
                            id: r.id,
                            enabled: !r.enabled,
                          })
                        }
                      >
                        {r.enabled ? p.pause : p.resume}
                      </Button>
                    )}
                    <details>
                      <summary>{p.history}</summary>
                      {data.runs
                        .filter((run) => run.recurringId === r.id)
                        .map((run) => (
                          <p key={run.id}>
                            {formatDate(run.scheduledFor)}:{" "}
                            {run.taskIds.map((id, i) => (
                              <button
                                className="text-link"
                                key={id}
                                onClick={() => onTask(id)}
                              >
                                {number(i + 1)}{" "}
                              </button>
                            ))}
                          </p>
                        ))}
                    </details>
                  </article>
                ))}
              </section>
              {create && (
                <form
                  className="editor-form planning-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    send({
                      type: "recurrence.create",
                      name: String(f.get("name")),
                      taskId: String(f.get("taskId")),
                      schedule: {
                        frequency: f.get("frequency"),
                        interval: Number(f.get("interval")),
                        anchorDate: f.get("anchorDate"),
                        endDate: f.get("endDate") || null,
                        timezone,
                      },
                    });
                  }}
                >
                  <h2>{p.create}</h2>
                  <p>{p.scheduleSnapshot}</p>
                  <label>
                    {p.name}
                    <Input name="name" required maxLength={120} />
                  </label>
                  <label>
                    {p.sourceTask}
                    <FormSelect name="taskId" required>
                      {w.tasks
                        .filter(
                          (t) => !t.deletedAt && !t.archived && !t.parentId,
                        )
                        .map((t) => (
                          <SelectOption key={t.id} value={t.id}>
                            {taskLabel(w, t)}
                          </SelectOption>
                        ))}
                    </FormSelect>
                  </label>
                  <div className="form-grid">
                    <label>
                      {p.frequency}
                      <FormSelect name="frequency">
                        {(["day", "week", "month"] as const).map((v) => (
                          <SelectOption key={v} value={v}>
                            {p[v]}
                          </SelectOption>
                        ))}
                      </FormSelect>
                    </label>
                    <label>
                      {p.interval}
                      <Input
                        type="number"
                        name="interval"
                        defaultValue={1}
                        min={1}
                        max={365}
                        required
                      />
                    </label>
                    <label>
                      {p.anchorDate}
                      <Input
                        type="date"
                        name="anchorDate"
                        defaultValue={today()}
                        required
                      />
                    </label>
                    <label>
                      {p.endDate}
                      <Input type="date" name="endDate" />
                    </label>
                  </div>
                  <p>
                    {p.timezone}: {timezone}
                  </p>
                  <Button disabled={busy || !w.tasks.length}>{p.create}</Button>
                </form>
              )}
            </div>
          )}
          {tab === "capacity" && report && (
            <section>
              <label className="planning-week">
                {p.weekOf}
                <Input
                  type="date"
                  value={week}
                  onChange={(e) =>
                    e.target.value && setWeek(weekStart(e.target.value))
                  }
                />
              </label>
              <p>{p.capacityHint}</p>
              {manage && data?.capacity && (
                <form
                  key={data.capacity.workingDays.join(",")}
                  className="working-days"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send({
                      type: "capacity.calendar",
                      workingDays: new FormData(e.currentTarget)
                        .getAll("days")
                        .map(Number),
                    });
                  }}
                >
                  <fieldset>
                    <legend>{p.workingDays}</legend>
                    {Array.from({ length: 7 }, (_, i) => (
                      <label key={i}>
                        <Checkbox
                          name="days"
                          value={String(i)}
                          defaultChecked={data.capacity!.workingDays.includes(
                            i,
                          )}
                        />
                        {new Intl.DateTimeFormat(locale, {
                          weekday: "long",
                          timeZone: "UTC",
                        }).format(new Date(Date.UTC(2026, 0, 4 + i)))}
                      </label>
                    ))}
                  </fieldset>
                  <Button disabled={busy}>{p.save}</Button>
                </form>
              )}
              <p>
                {p.unassigned}: {number(data?.capacity?.unassigned ?? 0)}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {[
                        p.person,
                        p.available,
                        p.allocated,
                        p.unscheduled,
                        p.unestimated,
                        p.utilization,
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.capacity?.rows.map((r) => (
                      <tr key={r.userId}>
                        <td>
                          {r.name}
                          {r.overloaded && (
                            <small className="overdue"> · {p.overloaded}</small>
                          )}
                        </td>
                        <td>
                          {manage ? (
                            <form
                              className="capacity-form"
                              key={`${week}-${r.capacity}`}
                              onSubmit={(e) => {
                                e.preventDefault();
                                send({
                                  type: "capacity.save",
                                  userId: r.userId,
                                  week,
                                  hours: Number(
                                    new FormData(e.currentTarget).get("hours"),
                                  ),
                                });
                              }}
                            >
                              <Input
                                type="number"
                                name="hours"
                                min={0}
                                max={168}
                                step={0.5}
                                defaultValue={r.capacity}
                                aria-label={`${p.available}: ${r.name}`}
                                required
                              />
                              <Button size="sm" disabled={busy}>
                                {p.save}
                              </Button>
                            </form>
                          ) : (
                            number(r.capacity)
                          )}
                        </td>
                        <td>{number(r.allocated)}</td>
                        <td>{number(r.unscheduled)}</td>
                        <td>{number(r.unestimated)}</td>
                        <td>
                          {r.utilization === null
                            ? "—"
                            : `${number(r.utilization)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
