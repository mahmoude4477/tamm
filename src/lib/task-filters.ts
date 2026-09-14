import type { Task, Workspace } from "./types";
import { isOpen } from "./reports";
export type TaskFilters = {
  team?: string;
  department?: string;
  creator?: string;
  tag?: string;
  from?: string;
  to?: string;
  overdue?: boolean;
  dependency?: boolean;
};
export function matchesFilters(
  w: Workspace,
  t: Task,
  f: TaskFilters,
  today: string,
) {
  const people = w.members.filter((m) =>
    [t.assigneeId, ...(t.assigneeIds ?? [])].includes(m.id),
  );
  const teams = new Set(
    people.flatMap((m) => [m.teamId, ...(m.teamIds ?? [])]).filter(Boolean),
  );
  return (
    (!f.team || teams.has(f.team)) &&
    (!f.department ||
      w.teams.some(
        (team) => teams.has(team.id) && team.departmentId === f.department,
      )) &&
    (!f.creator || t.reporterId === f.creator) &&
    (!f.tag ||
      t.tags.some((tag) => tag.toLowerCase().includes(f.tag!.toLowerCase()))) &&
    (!f.from || (!!t.dueDate && t.dueDate >= f.from)) &&
    (!f.to || (!!t.dueDate && t.dueDate <= f.to)) &&
    (!f.overdue || (!!t.dueDate && t.dueDate < today && isOpen(w, t))) &&
    (!f.dependency || t.dependencyIds.length > 0)
  );
}
