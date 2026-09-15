"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "./ui/chart";
import { Input } from "./ui/input";
import { FormSelect, SelectOption } from "./ui/form-select";
import { Button } from "./ui/button";
import { readRequest } from "@/lib/read-request";
import type { Workspace } from "@/lib/types";
import { projectHealth, type Analytics } from "@/lib/planning/analytics";
import { addDays } from "@/lib/planning/model";
import { useDates, useLocale, useMessages } from "./locale-provider";

function previewAnalytics(
  w: Workspace,
  from: string,
  to: string,
  project: string,
  date: string,
): Analytics {
  const tasks = w.tasks.filter(
    (t) => !t.archived && !t.deletedAt && (!project || t.projectId === project),
  );
  const done = (statusId: string) =>
    w.statuses.find((s) => s.id === statusId)?.category === "done";
  const open = tasks.filter(
    (t) =>
      !done(t.statusId) &&
      w.statuses.find((s) => s.id === t.statusId)?.category !== "cancelled",
  );
  const completed = tasks.filter(
    (t) =>
      done(t.statusId) &&
      t.completedAt &&
      t.completedAt.slice(0, 10) >= from &&
      t.completedAt.slice(0, 10) <= to,
  );
  const projects = w.projects
    .filter(
      (p) => !p.archived && !p.deletedAt && (!project || p.id === project),
    )
    .map((p) => {
      const own = tasks.filter((t) => t.projectId === p.id),
        active = open.filter((t) => t.projectId === p.id),
        finished = completed.filter((t) => t.projectId === p.id);
      const row = {
        id: p.id,
        name: p.name,
        startDate: p.startDate ?? null,
        endDate: p.endDate ?? null,
        total: own.length,
        completed: own.filter((t) => done(t.statusId)).length,
        open: active.length,
        overdue: active.filter((t) => t.dueDate && t.dueDate < date).length,
        blocked: active.filter((t) =>
          t.dependencyIds.some(
            (id) => !done(w.tasks.find((d) => d.id === id)?.statusId ?? ""),
          ),
        ).length,
        periodCompleted: finished.length,
        onTime: finished.filter(
          (t) => t.dueDate && t.completedAt!.slice(0, 10) <= t.dueDate,
        ).length,
        datedCompleted: finished.filter((t) => t.dueDate).length,
        medianDays: null,
        p85Days: null,
        lateMilestones: 0,
        progress: own.length
          ? Math.round(
              (own.filter((t) => done(t.statusId)).length / own.length) * 100,
            )
          : 0,
        forecastWeeks: null,
      };
      return { ...row, health: projectHealth(row, date) };
    });
  const weekly: Analytics["weekly"] = [];
  for (let week = from; week <= to; week = addDays(week, 7))
    weekly.push({
      week,
      completed: completed.filter(
        (t) =>
          t.completedAt!.slice(0, 10) >= week &&
          t.completedAt!.slice(0, 10) < addDays(week, 7),
      ).length,
    });
  return {
    from,
    to,
    projects,
    weekly,
    aging: ["under7", "under30", "over30"].map((bucket) => ({
      bucket,
      count: open.filter((t) => {
        const age = Math.max(
          0,
          (Date.parse(date) - Date.parse(t.createdAt)) / 86400000,
        );
        return bucket === "under7"
          ? age < 7
          : bucket === "under30"
            ? age >= 7 && age < 30
            : age >= 30;
      }).length,
    })),
  };
}
export function AnalyticsPanel({ w, demo }: { w: Workspace; demo: boolean }) {
  const en = useMessages(),
    p = en.planning,
    copy = en.analyticsUI,
    { today, formatDate } = useDates(),
    { locale } = useLocale();
  const [filters, setFilters] = useState({
    from: addDays(today(), -83),
    to: today(),
    project: "",
  });
  const [remote, setRemote] = useState<Analytics | null>(null),
    [error, setError] = useState("");
  const preview = useMemo(
    () =>
      demo
        ? previewAnalytics(
            w,
            filters.from,
            filters.to,
            filters.project,
            today(),
          )
        : null,
    [demo, w, filters],
  );
  const data = demo ? preview : remote;
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setError("");
    setRemote(null);
    readRequest(
      `/api/analytics?${new URLSearchParams({ workspaceId: w.id, ...filters })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw Error();
        const result = await r.json();
        if (!controller.signal.aborted) setRemote(result);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(en.common.error);
      });
    return () => controller.abort();
  }, [w.id, demo, filters, en.common.error]);
  const number = (v: number | null) =>
    v === null ? "—" : v.toLocaleString(locale, { maximumFractionDigits: 1 });
  const totals = data?.projects.reduce(
    (a, r) => ({
      open: a.open + r.open,
      overdue: a.overdue + r.overdue,
      completed: a.completed + r.periodCompleted,
      onTime: a.onTime + r.onTime,
      dated: a.dated + r.datedCompleted,
    }),
    { open: 0, overdue: 0, completed: 0, onTime: 0, dated: 0 },
  );
  const config = {
    completed: { label: p.completed, color: "var(--chart-1)" },
    open: { label: p.open, color: "var(--chart-2)" },
    count: { label: p.open, color: "var(--chart-3)" },
  };
  const aging = ["under7", "under30", "over30"].map((bucket) => ({
    name: p[bucket as "under7"],
    count: data?.aging.find((r) => r.bucket === bucket)?.count ?? 0,
  }));
  return (
    <section className="planning-panel analytics-page">
      <div className="page-heading">
        <div>
          <h1>{p.analytics}</h1>
          <p>{copy.subtitle}</p>
        </div>
      </div>
      <form
        className="analytics-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setFilters({
            from: String(f.get("from")),
            to: String(f.get("to")),
            project: String(f.get("project") ?? ""),
          });
        }}
      >
        <label>
          {p.from}
          <Input name="from" type="date" required defaultValue={filters.from} />
        </label>
        <label>
          {p.to}
          <Input name="to" type="date" required defaultValue={filters.to} />
        </label>
        <label>
          {p.project}
          <FormSelect name="project" defaultValue="">
            <SelectOption value="">{p.allProjects}</SelectOption>
            {w.projects
              .filter((p) => !p.archived && !p.deletedAt)
              .map((p) => (
                <SelectOption key={p.id} value={p.id}>
                  {p.name}
                </SelectOption>
              ))}
          </FormSelect>
        </label>
        <Button>{p.apply}</Button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && (
        <div role="status" className="analytics-loading">
          {copy.loading}
        </div>
      )}
      {data && totals && (
        <>
          <div className="analytics-summary" aria-label={copy.summary}>
            {[
              [p.open, totals.open],
              [p.completed, totals.completed],
              [p.overdue, totals.overdue],
              [
                p.onTime,
                totals.dated
                  ? `${number((totals.onTime / totals.dated) * 100)}%`
                  : "—",
              ],
            ].map(([label, value]) => (
              <section key={label} className="analytics-stat">
                <span>{label}</span>
                <strong>
                  {typeof value === "number" ? number(value) : value}
                </strong>
              </section>
            ))}
          </div>
          {!data.projects.some((r) => r.total) ? (
            <p className="empty">{copy.noData}</p>
          ) : (
            <>
              <div className="analytics-charts">
                <section className="planning-card">
                  <h2>{p.throughput}</h2>
                  <ChartContainer
                    config={config}
                    className="analytics-chart"
                    aria-label={p.throughput}
                  >
                    <BarChart
                      accessibilityLayer
                      data={data.weekly}
                      margin={{ top: 16, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="week"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        minTickGap={24}
                        tickFormatter={formatDate}
                      />
                      <YAxis
                        width={38}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={number}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(v) => formatDate(String(v))}
                          />
                        }
                      />
                      <Bar
                        dataKey="completed"
                        fill="var(--color-completed)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={44}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ChartContainer>
                  <details className="chart-details">
                    <summary>{copy.weeklyDetails}</summary>
                    <table>
                      <thead>
                        <tr>
                          <th>{p.from}</th>
                          <th>{p.completed}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.weekly.map((r) => (
                          <tr key={r.week}>
                            <th>{formatDate(r.week)}</th>
                            <td>{number(r.completed)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </section>
                <section className="planning-card">
                  <h2>{p.aging}</h2>
                  <ChartContainer
                    config={config}
                    className="analytics-chart"
                    aria-label={p.aging}
                  >
                    <BarChart
                      accessibilityLayer
                      data={aging}
                      margin={{ top: 16, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                      />
                      <YAxis
                        width={38}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={number}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="count"
                        fill="var(--color-count)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={54}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ChartContainer>
                  <details className="chart-details">
                    <summary>{copy.agingDetails}</summary>
                    <table>
                      <tbody>
                        {aging.map((r) => (
                          <tr key={r.name}>
                            <th>{r.name}</th>
                            <td>{number(r.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </section>
              </div>
              <section className="planning-card">
                <h2>{copy.distribution}</h2>
                <div className="chart-scroll">
                  <ChartContainer
                    config={config}
                    className="analytics-chart project-chart"
                    style={{
                      minWidth: Math.max(300, data.projects.length * 100),
                    }}
                    aria-label={copy.distribution}
                  >
                    <BarChart
                      accessibilityLayer
                      data={data.projects}
                      margin={{ top: 16, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                      />
                      <YAxis
                        width={38}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={number}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar
                        dataKey="open"
                        stackId="work"
                        fill="var(--color-open)"
                        maxBarSize={48}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="completed"
                        stackId="work"
                        fill="var(--color-completed)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              </section>
            </>
          )}
          <section className="planning-card">
            <h2>{copy.projectDetails}</h2>
            <p>{p.forecastHint}</p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {[
                      p.project,
                      p.health,
                      p.progress,
                      p.open,
                      p.overdue,
                      p.blocked,
                      p.completed,
                      p.onTime,
                      p.medianDays,
                      p.p85Days,
                      p.forecast,
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((r) => (
                    <tr key={r.id}>
                      <th>{r.name}</th>
                      <td>
                        <span className={`health health-${r.health}`}>
                          {p[r.health]}
                        </span>
                      </td>
                      <td>{number(r.progress)}%</td>
                      <td>{number(r.open)}</td>
                      <td>{number(r.overdue)}</td>
                      <td>{number(r.blocked)}</td>
                      <td>{number(r.periodCompleted)}</td>
                      <td>
                        {r.datedCompleted
                          ? `${number((r.onTime / r.datedCompleted) * 100)}%`
                          : "—"}
                      </td>
                      <td>{number(r.medianDays)}</td>
                      <td>{number(r.p85Days)}</td>
                      <td>
                        {r.forecastWeeks === null
                          ? p.noEstimate
                          : number(r.forecastWeeks)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
