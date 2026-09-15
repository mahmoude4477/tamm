"use client";
import { useEffect, useState } from "react";
import type { Workspace } from "@/lib/types";
import type { Analytics } from "@/lib/planning/analytics";
import { addDays } from "@/lib/planning/model";
import { useDates, useLocale, useMessages } from "./locale-provider";
import { Button } from "./ui/button";
export function AnalyticsPanel({ w, demo }: { w: Workspace; demo: boolean }) {
  const p = useMessages().planning,
    en = useMessages(),
    { today, formatDate } = useDates(),
    { locale } = useLocale();
  const [filters, setFilters] = useState({
      from: addDays(today(), -83),
      to: today(),
      project: "",
    }),
    [data, setData] = useState<Analytics | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setError("");
    setData(null);
    fetch(
      `/api/analytics?${new URLSearchParams({ workspaceId: w.id, ...filters })}`,
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
  }, [w.id, demo, filters]);
  const number = (v: number | null) =>
    v === null ? "—" : v.toLocaleString(locale, { maximumFractionDigits: 1 });
  return (
    <section className="planning-panel">
      <h1>{p.analytics}</h1>
      {demo ? (
        <p>{p.demoHint}</p>
      ) : (
        <>
          <form
            className="analytics-filters"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setFilters({
                from: String(f.get("from")),
                to: String(f.get("to")),
                project: String(f.get("project")),
              });
            }}
          >
            <label>
              {p.from}
              <input
                name="from"
                type="date"
                required
                defaultValue={filters.from}
              />
            </label>
            <label>
              {p.to}
              <input name="to" type="date" required defaultValue={filters.to} />
            </label>
            <label>
              {p.project}
              <select name="project">
                <option value="">{p.allProjects}</option>
                {w.projects
                  .filter((p) => !p.archived && !p.deletedAt)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button>{p.apply}</Button>
          </form>
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
                {data?.projects.map((r) => (
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
          <div className="planning-grid">
            <section className="planning-card">
              <h2>{p.throughput}</h2>
              {data?.weekly.map((row) => (
                <div className="metric-bar" key={row.week}>
                  <span>{formatDate(row.week)}</span>
                  <meter
                    min={0}
                    max={Math.max(1, ...data.weekly.map((r) => r.completed))}
                    value={row.completed}
                    aria-label={formatDate(row.week)}
                  />
                  <strong>{number(row.completed)}</strong>
                </div>
              ))}
            </section>
            <section className="planning-card">
              <h2>{p.aging}</h2>
              {(["under7", "under30", "over30"] as const).map((bucket) => (
                <p key={bucket}>
                  {p[bucket]}:{" "}
                  <strong>
                    {number(
                      data?.aging.find((r) => r.bucket === bucket)?.count ?? 0,
                    )}
                  </strong>
                </p>
              ))}
            </section>
          </div>
        </>
      )}
      <p role="alert">{error}</p>
    </section>
  );
}
