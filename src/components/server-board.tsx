"use client";
import { useEffect, useState, useRef } from "react";
import type { Task, Workspace } from "@/lib/types";
import type { TaskFilters } from "@/lib/task-filters";
import type { Command } from "@/lib/commands";
import { canEditTask } from "@/lib/permissions";
import { useDates, useMessages } from "./locale-provider";
import { Avatar, StatusDot } from "./workspace-shared";
import { Button } from "./ui/button";
export function ServerBoard({
  w,
  filters,
  onTask,
  send,
}: {
  w: Workspace;
  filters: TaskFilters & { scope?: string };
  onTask: (id: string) => void;
  send: (c: Command) => Promise<boolean>;
}) {
  const en = useMessages(),
    { formatDate } = useDates(),
    [columns, setColumns] = useState<
      Record<string, { items: Task[]; total: number; page: number }>
    >({}),
    [error, setError] = useState(""),
    [loading, setLoading] = useState<Record<string, boolean>>({}),
    [revision, setRevision] = useState(0);
  const generation = useRef(0),
    dragged = useRef<Task | null>(null);
  const serialized = JSON.stringify(filters);
  const busyLoads = useRef(new Set<string>());
  async function load(
    status: string,
    page: number,
    signal?: AbortSignal,
    token = generation.current,
  ) {
    if (busyLoads.current.has(`${token}:${status}`)) return;
    busyLoads.current.add(`${token}:${status}`);
    setLoading((v) => ({ ...v, [status]: true }));
    try {
      const q = new URLSearchParams({
        workspaceId: w.id,
        status,
        size: "25",
        page: String(page),
        sort: "dueDate",
      });
      for (const [k, v] of Object.entries(JSON.parse(serialized)))
        if (v !== "" && v != null && k !== "status") q.set(k, String(v));
      const r = await fetch(`/api/tasks?${q}`, { signal });
      if (!r.ok) throw Error();
      const data = await r.json();
      if (generation.current === token)
        setColumns((c) => ({
          ...c,
          [status]: {
            items: page
              ? [
                  ...(c[status]?.items ?? []),
                  ...data.items.filter(
                    (t: Task) =>
                      !c[status]?.items.some((old) => old.id === t.id),
                  ),
                ]
              : data.items,
            total: data.total,
            page,
          },
        }));
    } catch (e) {
      if (
        !(e instanceof Error && e.name === "AbortError") &&
        generation.current === token
      )
        setError(en.common.error);
    } finally {
      busyLoads.current.delete(`${token}:${status}`);
      if (generation.current === token)
        setLoading((v) => ({ ...v, [status]: false }));
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    const token = ++generation.current;
    setColumns({});
    setError("");
    for (const status of w.statuses)
      if (!filters.status || filters.status === status.id)
        load(status.id, 0, controller.signal, token);
    return () => controller.abort();
  }, [w.id, serialized, revision, w.statuses.map((s) => s.id).join(",")]);
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener("tamm:refresh", refresh);
    return () => window.removeEventListener("tamm:refresh", refresh);
  }, []);
  return (
    <>
      <p role="alert">{error}</p>
      <div className="board">
        {w.statuses
          .filter((s) => !filters.status || filters.status === s.id)
          .map((status) => {
            const column = columns[status.id];
            return (
              <section
                className="board-column"
                key={status.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  const task = dragged.current;
                  dragged.current = null;
                  if (
                    task &&
                    (await send({
                      type: "task.update",
                      id: task.id,
                      version: task.version,
                      data: { statusId: status.id },
                    }))
                  )
                    setRevision((v) => v + 1);
                }}
              >
                <div className="column-header">
                  <StatusDot w={w} id={status.id} />
                  <h3>{status.name}</h3>
                  <span>{column?.total ?? "…"}</span>
                </div>
                <div className="column-tasks">
                  {column?.items.map((t) => (
                    <button
                      key={t.id}
                      className="task-card"
                      draggable={canEditTask(w, t)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                        dragged.current = t;
                      }}
                      onDragEnd={() => {
                        dragged.current = null;
                      }}
                      onClick={() => onTask(t.id)}
                    >
                      <div className="card-top">
                        {w.projects.find((p) => p.id === t.projectId)?.code}-
                        {t.number}
                      </div>
                      <h4>{t.title}</h4>
                      <div className="card-bottom">
                        <span className={`priority priority-${t.priority}`}>
                          {en.priorities[t.priority]}
                        </span>
                        <Avatar
                          size="small"
                          name={
                            w.members.find((m) => m.id === t.assigneeId)
                              ?.name ?? en.common.unassigned
                          }
                        />
                      </div>
                      <div className="card-meta">
                        <span>{formatDate(t.dueDate)}</span>
                        <span>
                          {t.checklist.filter((c) => c.done).length}/
                          {t.checklist.length}
                        </span>
                      </div>
                    </button>
                  ))}
                  {column?.total === 0 && (
                    <p className="empty-column">{en.tasks.emptyColumn}</p>
                  )}
                  {(!column || column.items.length < column.total) && (
                    <Button
                      variant="ghost"
                      disabled={loading[status.id]}
                      onClick={() => load(status.id, (column?.page ?? -1) + 1)}
                    >
                      {loading[status.id]
                        ? en.common.loading
                        : en.planning.loadMore}
                    </Button>
                  )}
                </div>
              </section>
            );
          })}
      </div>
    </>
  );
}
