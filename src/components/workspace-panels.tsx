"use client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { can } from "@/lib/permissions";
import { activeTasks, isOpen, monthlyReport } from "@/lib/reports";
import type { Role, Task, Workspace } from "@/lib/types";
import en from "@/messages/en.json";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Plus,
  Users,
} from "lucide-react";
import { useState } from "react";

import { today } from "@/lib/dates";
import type { Send } from "./task-editor";
import { Avatar, download, Heading, StatusDot } from "./workspace-shared";
export function Calendar({
  tasks,
  month,
  setMonth,
  open,
}: {
  tasks: Task[];
  month: string;
  setMonth: (m: string) => void;
  open: (id: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(Date.UTC(y, m - 1, 1 - first.getUTCDay() + i)),
  );
  const shift = (n: number) =>
    setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  return (
    <div className="calendar">
      <div className="calendar-heading">
        <h2>
          {new Intl.DateTimeFormat("en", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(first)}
        </h2>
        <div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={en.tasks.previousMonth}
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={en.tasks.nextMonth}
            onClick={() => shift(1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      <div className="calendar-weekdays">
        {days.slice(0, 7).map((d) => (
          <span key={d.toISOString()}>
            {new Intl.DateTimeFormat("en", {
              weekday: "short",
              timeZone: "UTC",
            }).format(d)}
          </span>
        ))}
      </div>
      <div className="calendar-grid">
        {days.map((d) => {
          const key = d.toISOString().slice(0, 10);
          return (
            <div
              className={d.getUTCMonth() !== m - 1 ? "outside" : ""}
              key={key}
            >
              <time className={key === today() ? "is-today" : ""}>
                {d.getUTCDate()}
              </time>
              {tasks
                .filter((t) => t.dueDate === key)
                .map((t) => (
                  <button key={t.id} onClick={() => open(t.id)}>
                    {t.title}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function TeamPanel({
  w,
  send,
  busy,
}: {
  w: Workspace;
  send: Send;
  busy: boolean;
}) {
  const [dialog, setDialog] = useState<"member" | "team" | "department" | null>(
    null,
  );
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  const manage = can(actor.role, "user.manage");
  return (
    <>
      <Heading title={en.team.title} subtitle={en.team.subtitle}>
        {manage && (
          <Button onClick={() => setDialog("member")}>
            <Plus size={16} />
            {en.team.addMember}
          </Button>
        )}
      </Heading>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                en.team.name,
                en.team.role,
                en.team.team,
                en.team.workload,
                en.team.capacity,
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {w.members.map((m) => {
              const tasks = activeTasks(w).filter(
                (t) => t.assigneeId === m.id && isOpen(w, t),
              );
              return (
                <tr key={m.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar name={m.name} />
                      <span>
                        {m.name}
                        <small>{m.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {manage ? (
                      <select
                        disabled={busy}
                        value={m.role}
                        aria-label={`${en.team.role} ${m.name}`}
                        onChange={(e) =>
                          send({
                            type: "member.update",
                            id: m.id,
                            role: e.target.value as Role,
                            teamId: m.teamId,
                          })
                        }
                      >
                        {Object.entries(en.team.roles).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      en.team.roles[m.role]
                    )}
                  </td>
                  <td>
                    {manage ? (
                      <select
                        disabled={busy}
                        value={m.teamId ?? ""}
                        aria-label={`${en.team.team} ${m.name}`}
                        onChange={(e) =>
                          send({
                            type: "member.update",
                            id: m.id,
                            role: m.role,
                            teamId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">{en.team.noTeam}</option>
                        {w.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (w.teams.find((t) => t.id === m.teamId)?.name ??
                      en.team.noTeam)
                    )}
                  </td>
                  <td>
                    {tasks.length}
                    <div className="workload-bar">
                      <span
                        style={{
                          width: `${Math.min((tasks.length / 10) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td>
                    {tasks.reduce((s, t) => s + t.estimatedHours, 0)}{" "}
                    {en.common.hours}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="team-sections">
        <section>
          <div className="section-heading">
            <h2>{en.team.teams}</h2>
            {manage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog("team")}
              >
                <Plus size={14} />
                {en.team.addTeam}
              </Button>
            )}
          </div>
          {w.teams.map((t) => (
            <div className="team-item" key={t.id}>
              <Users size={18} />
              <span>
                {t.name}
                <small>
                  {w.departments.find((d) => d.id === t.departmentId)?.name}
                </small>
              </span>
              <b>{w.members.filter((m) => m.teamId === t.id).length}</b>
            </div>
          ))}
        </section>
        <section>
          <div className="section-heading">
            <h2>{en.team.departments}</h2>
            {manage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog("department")}
              >
                <Plus size={14} />
                {en.team.addDepartment}
              </Button>
            )}
          </div>
          {w.departments.map((d) => (
            <div className="team-item" key={d.id}>
              <Layers size={18} />
              {d.name}
            </div>
          ))}
        </section>
      </div>
      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogTitle>
            {dialog === "member"
              ? en.team.addMember
              : dialog === "team"
                ? en.team.addTeam
                : en.team.addDepartment}
          </DialogTitle>
          <DialogDescription>
            {dialog === "member" ? en.team.addMemberNote : en.team.subtitle}
          </DialogDescription>
          <form
            className="editor-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const success =
                dialog === "member"
                  ? await send({
                      type: "member.add",
                      email: String(f.get("name")),
                    })
                  : dialog === "team"
                    ? await send({
                        type: "team.create",
                        name: String(f.get("name")),
                        departmentId: String(f.get("department")) || null,
                      })
                    : await send({
                        type: "department.create",
                        name: String(f.get("name")),
                      });
              if (success) setDialog(null);
            }}
          >
            <label>
              {dialog === "member" ? en.team.email : en.team.name}
              <input
                name="name"
                type={dialog === "member" ? "email" : "text"}
                required
                maxLength={200}
              />
            </label>
            {dialog === "team" && (
              <label>
                {en.team.department}
                <select name="department">
                  <option value="">{en.common.none}</option>
                  {w.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button disabled={busy}>{en.common.add}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ReportPanel({
  w,
  month,
  setMonth,
}: {
  w: Workspace;
  month: string;
  setMonth: (value: string) => void;
}) {
  const report = monthlyReport(w, month);
  const rows = w.members.map((m) => {
    const completed = report.completed.filter((t) => t.assigneeId === m.id);
    return [
      m.name,
      completed.length,
      activeTasks(w).filter((t) => t.assigneeId === m.id && isOpen(w, t))
        .length,
      activeTasks(w).filter(
        (t) =>
          t.assigneeId === m.id &&
          isOpen(w, t) &&
          t.dueDate &&
          t.dueDate < today(),
      ).length,
      completed.filter(
        (t) => t.dueDate && t.completedAt!.slice(0, 10) <= t.dueDate,
      ).length,
    ];
  });
  const headers = [
    en.team.name,
    en.reports.completedColumn,
    en.reports.active,
    en.reports.overdue,
    en.reports.onTimeColumn,
  ];
  return (
    <>
      <Heading title={en.reports.title} subtitle={en.reports.subtitle}>
        <div className="button-row">
          <input
            aria-label={en.reports.month}
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() =>
              download([headers, ...rows], `tamm-report-${month}.csv`)
            }
          >
            <Download size={15} />
            {en.common.export}
          </Button>
        </div>
      </Heading>
      <div className="metrics">
        {[
          [en.reports.assigned, report.created],
          [en.reports.completed, report.completed.length],
          [
            en.reports.onTime,
            report.onTime === null ? "—" : report.onTime + "%",
          ],
          [
            en.reports.cycle,
            report.cycleDays === null
              ? "—"
              : report.cycleDays.toFixed(1) + " " + en.reports.days,
          ],
        ].map(([l, v]) => (
          <div className="metric" key={l}>
            <span>{l}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <section className="section">
        <div className="section-heading">
          <h2>{en.reports.byPerson}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]}>
                  {r.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="report-definition">{en.reports.definition}</p>
      </section>
    </>
  );
}
export function SettingsPanel({
  w,
  send,
  busy,
  demo,
}: {
  w: Workspace;
  send: Send;
  busy: boolean;
  demo: boolean;
}) {
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  return (
    <>
      <Heading title={en.settings.title} subtitle={en.settings.subtitle} />
      <div className="settings-grid">
        <section>
          <h2>{en.settings.workflow}</h2>
          <div className="workflow-list">
            {w.statuses.map((s) => (
              <div key={s.id}>
                <StatusDot w={w} id={s.id} />
                <strong>{s.name}</strong>
                <span>{en.settings.categories[s.category]}</span>
              </div>
            ))}
          </div>
          {can(actor.role, "workflow.manage") && (
            <form
              className="editor-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                if (
                  await send({
                    type: "workflow.create",
                    name: String(f.get("name")),
                    category: String(
                      f.get("category"),
                    ) as Workspace["statuses"][number]["category"],
                    color: String(f.get("color")),
                  })
                )
                  form.reset();
              }}
            >
              <label>
                {en.settings.statusName}
                <input name="name" required maxLength={200} />
              </label>
              <div className="form-grid">
                <label>
                  {en.settings.category}
                  <select name="category">
                    {Object.entries(en.settings.categories).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {en.projects.color}
                  <input name="color" type="color" defaultValue="#6b8d79" />
                </label>
              </div>
              <Button variant="outline" disabled={busy}>
                <Plus size={16} />
                {en.settings.addStatus}
              </Button>
            </form>
          )}
        </section>
        <section>
          <h2>{en.settings.trash}</h2>
          {!w.tasks.some((t) => t.deletedAt) && (
            <p className="muted">{en.settings.trashEmpty}</p>
          )}
          {w.tasks
            .filter((t) => t.deletedAt)
            .map((t) => (
              <div className="restore-row" key={t.id}>
                <span>{t.title}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !can(actor.role, "task.delete")}
                  onClick={() => send({ type: "task.restore", id: t.id })}
                >
                  {en.common.restore}
                </Button>
              </div>
            ))}
          <h2>{en.settings.archived}</h2>
          {w.tasks
            .filter((t) => t.archived && !t.deletedAt)
            .map((t) => (
              <div className="restore-row" key={t.id}>
                <span>{t.title}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !can(actor.role, "task.delete")}
                  onClick={() =>
                    send({ type: "task.archive", id: t.id, archived: false })
                  }
                >
                  {en.common.restore}
                </Button>
              </div>
            ))}
          {!demo && <AccountSettings />}
        </section>
      </div>
    </>
  );
}
function AccountSettings() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="detail-section">
      <h2>{en.settings.password}</h2>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            const result = await authClient.changePassword({
              currentPassword: String(f.get("currentPassword")),
              newPassword: String(f.get("newPassword")),
              revokeOtherSessions: true,
            });
            setMessage(
              result.error ? en.common.error : en.settings.passwordChanged,
            );
            if (!result.error) form.reset();
          } catch {
            setMessage(en.common.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {en.settings.currentPassword}
          <input
            name="currentPassword"
            autoComplete="current-password"
            type="password"
            required
          />
        </label>
        <label>
          {en.settings.newPassword}
          <input
            name="newPassword"
            autoComplete="new-password"
            type="password"
            minLength={12}
            required
          />
        </label>
        <Button disabled={busy}>{en.common.save}</Button>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}
