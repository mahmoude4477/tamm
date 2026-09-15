"use client";
import { useState } from "react";
import type { Workspace, Task } from "@/lib/types";
import { useMessages, useLocale, useDates } from "./locale-provider";
import { Button } from "./ui/button";
export function TaskCalendar({
  w,
  tasks,
  open,
  openProject,
}: {
  w: Workspace;
  tasks: Task[];
  open: (id: string) => void;
  openProject: (id: string) => void;
}) {
  const en = useMessages(),
    { locale } = useLocale(),
    { today } = useDates();
  const [mode, setMode] = useState<"day" | "week" | "month">("month"),
    [selected, setSelected] = useState(today());
  const anchor = new Date(`${selected}T12:00:00Z`);
  let start = new Date(anchor),
    count = 1;
  if (mode === "month") {
    start = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1, 12),
    );
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    count = 42;
  } else if (mode === "week") {
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    count = 7;
  }
  const days = Array.from({ length: count }, (_, i) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    return date;
  });
  function shift(n: number) {
    const date = new Date(anchor);
    if (mode === "month") {
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + n);
    } else date.setUTCDate(date.getUTCDate() + n * (mode === "week" ? 7 : 1));
    setSelected(date.toISOString().slice(0, 10));
  }
  return (
    <section className="calendar">
      <div className="calendar-heading">
        <h2>
          {new Intl.DateTimeFormat(locale, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(anchor)}
        </h2>
        <div className="button-row">
          {(["day", "week", "month"] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={mode === v ? "default" : "ghost"}
              aria-pressed={mode === v}
              onClick={() => setMode(v)}
            >
              {en.views[v]}
            </Button>
          ))}
        </div>
      </div>
      <div className="button-row">
        <Button variant="outline" onClick={() => shift(-1)}>
          {en.common.back}
        </Button>
        <input
          aria-label={en.views.calendarDates}
          type="date"
          value={selected}
          onChange={(e) => e.target.value && setSelected(e.target.value)}
        />
        <Button variant="outline" onClick={() => setSelected(today())}>
          {en.views.today}
        </Button>
        <Button variant="outline" onClick={() => shift(1)}>
          {en.views.next}
        </Button>
      </div>
      <div className="calendar-scroll">
        <div
          className={`calendar-grid ${mode === "day" ? "calendar-day" : ""}`}
        >
          {days.map((date) => {
            const key = date.toISOString().slice(0, 10);
            return (
              <div
                key={key}
                className={
                  date.getUTCMonth() !== anchor.getUTCMonth() ? "outside" : ""
                }
              >
                <time
                  dateTime={key}
                  className={key === today() ? "is-today" : ""}
                >
                  {new Intl.DateTimeFormat(locale, {
                    weekday: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(date)}
                </time>
                {tasks
                  .filter((t) => t.dueDate === key || t.startDate === key)
                  .map((t) => (
                    <button key={t.id} onClick={() => open(t.id)}>
                      <small>
                        {t.dueDate === key ? en.views.due : en.views.starts}
                      </small>{" "}
                      {t.title}
                    </button>
                  ))}
                {w.projects
                  .filter(
                    (p) =>
                      !p.archived &&
                      !p.deletedAt &&
                      (p.startDate === key || p.endDate === key),
                  )
                  .map((p) => (
                    <button key={p.id} onClick={() => openProject(p.id)}>
                      <small>
                        {en.admin.project} ·{" "}
                        {p.endDate === key ? en.views.due : en.views.starts}
                      </small>{" "}
                      {p.name}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
