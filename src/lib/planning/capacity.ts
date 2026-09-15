import type { Task, Workspace } from "../types";
import { addDays, daysBetween, weekStart } from "./model";
export function capacityPlan(
  w: Workspace,
  week: string,
  overrides: { userId: string; hours: number }[],
  currentDate: string,
) {
  const monday = weekStart(week),
    end = addDays(monday, 6),
    workingDays = w.settings?.workingDays ?? [1, 2, 3, 4, 5];
  const rows = w.members
    .filter((m) => m.active !== false)
    .map((m) => ({
      userId: m.id,
      name: m.name,
      capacity: overrides.find((o) => o.userId === m.id)?.hours ?? 40,
      allocated: 0,
      unscheduled: 0,
      unestimated: 0,
    }));
  let unassigned = 0;
  for (const t of w.tasks) {
    const project = w.projects.find((p) => p.id === t.projectId);
    if (
      t.deletedAt ||
      t.archived ||
      !project ||
      project.deletedAt ||
      project.archived ||
      ["done", "cancelled"].includes(
        w.statuses.find((s) => s.id === t.statusId)?.category ?? "",
      )
    )
      continue;
    const assignees = [
      ...new Set(
        [t.assigneeId, ...(t.assigneeIds ?? [])].filter(
          (id): id is string => !!id,
        ),
      ),
    ];
    const effort = Math.max(0, t.estimatedHours - (t.actualHours ?? 0));
    if (!assignees.length) {
      unassigned += effort;
      continue;
    }
    const span = allocationDays(t, monday, end, currentDate, workingDays);
    for (const id of assignees) {
      const r = rows.find((r) => r.userId === id);
      if (!r) continue;
      if (!t.estimatedHours) r.unestimated++;
      if (span === null) r.unscheduled += effort / assignees.length;
      else r.allocated += (effort * span) / assignees.length;
    }
  }
  return {
    week: monday,
    workingDays,
    unassigned,
    rows: rows.map((r) => ({
      ...r,
      allocated: Math.round(r.allocated * 100) / 100,
      unscheduled: Math.round(r.unscheduled * 100) / 100,
      utilization: r.capacity
        ? Math.round((r.allocated / r.capacity) * 100)
        : null,
      overloaded: r.allocated > r.capacity,
    })),
  };
}
function allocationDays(
  t: Task,
  monday: string,
  end: string,
  current: string,
  workingDays: number[],
) {
  if (!t.dueDate) return null;
  if (t.dueDate < current) return weekStart(current) === monday ? 1 : 0;
  const start = t.startDate && t.startDate > current ? t.startDate : current;
  if (start > end || t.dueDate < monday) return 0;
  let total = 0,
    inWeek = 0;
  const length = Math.min(daysBetween(start, t.dueDate), 36600);
  for (let n = 0; n <= length; n++) {
    const d = addDays(start, n),
      dow = new Date(d + "T12:00:00Z").getUTCDay();
    if (!workingDays.includes(dow)) continue;
    total++;
    if (d >= monday && d <= end) inWeek++;
  }
  return total
    ? inWeek / total
    : t.dueDate >= monday && t.dueDate <= end
      ? 1
      : 0;
}
