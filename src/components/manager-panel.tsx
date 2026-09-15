"use client";
import type { Workspace } from "@/lib/types";
import { activeTasks, isOpen } from "@/lib/reports";
import { useMessages, useDates, useLocale } from "./locale-provider";
import { Heading, Avatar } from "./workspace-shared";
import { TransferPanel } from "./operations-panel";
export function ManagerPanel({
  w,
  open,
  demo,
}: {
  w: Workspace;
  open: (id: string) => void;
  demo: boolean;
}) {
  const en = useMessages(),
    { today, formatDate } = useDates(),
    { locale } = useLocale(),
    tasks = activeTasks(w),
    date = today(),
    end = new Date(`${date}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const upcoming = end.toISOString().slice(0, 10),
    reviews = tasks.filter(
      (t) => w.statuses.find((s) => s.id === t.statusId)?.category === "review",
    );
  return (
    <>
      <Heading title={en.manager.title} subtitle={en.manager.subtitle} />
      <div className="metrics">
        {[
          [en.manager.open, tasks.filter((t) => isOpen(w, t)).length],
          [
            en.overview.overdue,
            tasks.filter((t) => isOpen(w, t) && t.dueDate && t.dueDate < date)
              .length,
          ],
          [
            en.manager.dueSoon,
            tasks.filter(
              (t) =>
                isOpen(w, t) &&
                t.dueDate &&
                t.dueDate >= date &&
                t.dueDate <= upcoming,
            ).length,
          ],
          [en.manager.approvals, reviews.length],
        ].map(([label, n]) => (
          <div className="metric" key={String(label)}>
            <span>{label}</span>
            <strong>{Number(n).toLocaleString(locale)}</strong>
          </div>
        ))}
      </div>
      <section className="panel">
        <h2>{en.manager.approvals}</h2>
        {!reviews.length && <p>{en.manager.empty}</p>}
        {reviews.map((t) => (
          <button key={t.id} className="task-row" onClick={() => open(t.id)}>
            <span />
            <span className="task-row-name">
              {t.title}
              <small>
                {w.members.find((m) => m.id === t.assigneeId)?.name}
              </small>
            </span>
            <span>{en.priorities[t.priority]}</span>
            <time>{formatDate(t.dueDate)}</time>
          </button>
        ))}
      </section>
      <section className="panel">
        <h2>{en.team.capacity}</h2>
        {w.members
          .filter((m) => m.active !== false)
          .map((m) => {
            const assigned = tasks.filter(
              (t) =>
                isOpen(w, t) &&
                [t.assigneeId, ...(t.assigneeIds ?? [])].includes(m.id),
            );
            return (
              <div className="restore-row" key={m.id}>
                <span className="person-cell">
                  <Avatar name={m.name} />
                  {m.name}
                </span>
                <span>
                  {assigned.length.toLocaleString(locale)} {en.tasks.taskCount}{" "}
                  ·{" "}
                  {assigned
                    .reduce((sum, t) => sum + t.estimatedHours, 0)
                    .toLocaleString(locale)}{" "}
                  {en.common.hours}
                </span>
              </div>
            );
          })}
      </section>
      <section className="panel">
        <h2>{en.manager.unassigned}</h2>
        {w.members
          .filter(
            (m) =>
              m.active !== false &&
              !tasks.some(
                (t) =>
                  isOpen(w, t) &&
                  [t.assigneeId, ...(t.assigneeIds ?? [])].includes(m.id),
              ),
          )
          .map((m) => (
            <p key={m.id}>{m.name}</p>
          ))}
      </section>
      {!demo && <TransferPanel w={w} />}
    </>
  );
}
