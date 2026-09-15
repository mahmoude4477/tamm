import type { Workspace, Task } from "./types";
export function isDone(w: Workspace, t: Task) {
  return w.statuses.find((s) => s.id === t.statusId)?.category === "done";
}
export function activeTasks(w: Workspace) {
  return w.tasks.filter(
    (t) =>
      !t.deletedAt &&
      !t.archived &&
      !w.projects.find((p) => p.id === t.projectId)?.archived &&
      !w.projects.find((p) => p.id === t.projectId)?.deletedAt,
  );
}
export function isOpen(w: Workspace, t: Task) {
  return !["done", "cancelled"].includes(
    w.statuses.find((s) => s.id === t.statusId)?.category ?? "open",
  );
}
export function monthlyReport(w: Workspace, month: string) {
  const tasks = w.tasks.filter((t) => !t.deletedAt);
  const completed = tasks.filter(
    (t) => isDone(w, t) && t.completedAt?.startsWith(month),
  );
  const onTime = completed.filter(
    (t) => t.dueDate && t.completedAt!.slice(0, 10) <= t.dueDate,
  );
  const dated = completed.filter((t) => t.dueDate);
  return {
    reopened: w.events.filter(
      (e) =>
        e.createdAt.startsWith(month) &&
        tasks.some((t) => t.id === e.taskId) &&
        w.statuses.find((s) => s.id === e.previousStatusId)?.category ===
          "done" &&
        w.statuses.find((s) => s.id === e.newStatusId)?.category !== "done",
    ).length,
    created: tasks.filter((t) => t.createdAt.startsWith(month)).length,
    completed,
    onTime: dated.length
      ? Math.round((onTime.length / dated.length) * 100)
      : null,
    cycleDays: completed.length
      ? completed.reduce(
          (sum, t) =>
            sum +
            (Date.parse(t.completedAt!) - Date.parse(t.createdAt)) / 86400000,
          0,
        ) / completed.length
      : null,
  };
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
