import { z } from "zod";
import type { Task } from "../types";
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
export const schedule = z
  .object({
    frequency: z.enum(["day", "week", "month"]),
    interval: z.number().int().min(1).max(365),
    anchorDate: day,
    endDate: day.nullable(),
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
  })
  .refine((v) => !v.endDate || v.endDate >= v.anchorDate);
export type Schedule = z.infer<typeof schedule>;
export type RecurringDefinition = Schedule & { tasks: Task[] };
export function addDays(date: string, amount: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(start: string, end: string) {
  return Math.round(
    (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
      86400000,
  );
}
export function weekStart(date: string) {
  const n = new Date(date + "T12:00:00Z").getUTCDay();
  return addDays(date, -(n + 6) % 7);
}
export function nextOccurrence(rule: Schedule, previous: string): string {
  if (rule.frequency !== "month")
    return addDays(
      previous,
      rule.interval * (rule.frequency === "week" ? 7 : 1),
    );
  const anchor = new Date(rule.anchorDate + "T12:00:00Z"),
    last = new Date(previous + "T12:00:00Z");
  const months =
    (last.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    last.getUTCMonth() -
    anchor.getUTCMonth();
  const next = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth() +
        (Math.floor(months / rule.interval) + 1) * rule.interval,
      1,
      12,
    ),
  );
  const end = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(anchor.getUTCDate(), end));
  return next.toISOString().slice(0, 10);
}
export function captureRecurring(tasks: Task[], rootId: string) {
  const root = tasks.find(
    (t) => t.id === rootId && !t.deletedAt && !t.archived,
  );
  if (!root) throw Error("notFound");
  const selected = new Set([rootId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const t of tasks)
      if (
        t.parentId &&
        selected.has(t.parentId) &&
        !selected.has(t.id) &&
        !t.deletedAt &&
        !t.archived
      ) {
        selected.add(t.id);
        changed = true;
      }
  }
  if (selected.size > 100) throw Error("invalid");
  return [
    root,
    ...tasks.filter((t) => t.id !== root.id && selected.has(t.id)),
  ].map((t) => ({
    ...t,
    parentId: selected.has(t.parentId ?? "") ? t.parentId : null,
    dependencyIds: t.dependencyIds.filter((id) => selected.has(id)),
    relatedIds: [],
    duplicateOfId: null,
  }));
}
